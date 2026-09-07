from uuid import UUID

from blockchain_client.exceptions import ReferenceValidationError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.models.users import User
from app.schemas.blockchain_explorer import (
    BlockchainAccessSessionResponse,
    BlockchainBlockResponse,
    BlockchainEvidenceResponse,
    BlockchainOverviewResponse,
    BlockchainTransactionResponse,
)
from app.services.blockchain_explorer_service import (
    BlockchainExplorerNotFoundError,
    BlockchainExplorerService,
    BlockchainExplorerUnavailableError,
)


router = APIRouter(prefix="/blockchain", tags=["Blockchain Explorer"])


@router.get("/overview", response_model=BlockchainOverviewResponse)
def overview(_: User = Depends(get_admin_user)):
    return _call(BlockchainExplorerService().overview)


@router.get("/block/{block_number}", response_model=BlockchainBlockResponse)
def block(block_number: int, _: User = Depends(get_admin_user)):
    return _call(BlockchainExplorerService().block, block_number)


@router.get("/transaction/{tx_hash}", response_model=BlockchainTransactionResponse)
def transaction(tx_hash: str, _: User = Depends(get_admin_user)):
    return _call(BlockchainExplorerService().transaction, tx_hash)


@router.get("/evidence/{evidence_id}", response_model=BlockchainEvidenceResponse)
def evidence(
    evidence_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    return _call(BlockchainExplorerService().evidence_by_id, db, evidence_id)


@router.get("/evidence-ref/{evidence_ref}", response_model=BlockchainEvidenceResponse)
def evidence_ref(
    evidence_ref: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    return _call(BlockchainExplorerService().evidence_by_ref, db, evidence_ref)


@router.get(
    "/access-session/{access_session_ref}",
    response_model=BlockchainAccessSessionResponse,
)
def access_session(
    access_session_ref: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    return _call(
        BlockchainExplorerService().access_session,
        db,
        access_session_ref,
    )


def _call(function, *args):
    try:
        return function(*args)
    except BlockchainExplorerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, ReferenceValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except BlockchainExplorerUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Blockchain Explorer is unavailable",
        ) from exc
