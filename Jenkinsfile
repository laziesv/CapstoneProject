pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
    timeout(time: 45, unit: 'MINUTES')
  }

  environment {
    DEPLOY_HOST = '172.17.0.1'
    DEPLOY_USER = 'root'
    DEPLOY_CREDENTIALS = 'deva-vps-ssh'
    APP_DIR = '/opt/deva'
    DEPLOY_DIR = '/opt/deva/deploy'
    BRANCH = 'deploy'
    HEALTH_URL = 'https://deva-demo.duckdns.org'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git submodule update --init --recursive'
      }
    }

    stage('Backend tests') {
      steps {
        sh '''
          set -eu
          python3.12 -m venv .ci-venv
          cd backend
          ../.ci-venv/bin/python -m pip install -r requirements.txt pytest
          ../.ci-venv/bin/python -m pytest -q tests
        '''
      }
    }

    stage('Frontend checks') {
      steps {
        dir('frontend') {
          sh '''
            set -eu
            npm ci
            npm test
            npm run lint
            npm run build
          '''
        }
      }
    }

    stage('Smart contract tests') {
      steps {
        dir('blockchain') {
          sh 'forge test'
        }
      }
    }

    stage('Deploy') {
      when {
        expression {
          env.BRANCH_NAME == 'deploy' || env.GIT_BRANCH in ['deploy', 'origin/deploy']
        }
      }
      steps {
        sshagent(credentials: [env.DEPLOY_CREDENTIALS]) {
          sh '''
            ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} "
              set -e
              cd ${APP_DIR}
              git fetch origin ${BRANCH}
              test \"\$(git rev-parse FETCH_HEAD)\" = \"${GIT_COMMIT}\"
              git checkout ${BRANCH}
              git pull --ff-only origin ${BRANCH}
              test \"\$(git rev-parse HEAD)\" = \"${GIT_COMMIT}\"
              cd ${DEPLOY_DIR}
              docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
            "
          '''
        }
      }
    }

    stage('Health check') {
      when {
        expression {
          env.BRANCH_NAME == 'deploy' || env.GIT_BRANCH in ['deploy', 'origin/deploy']
        }
      }
      steps {
        sh '''
          for attempt in $(seq 1 24); do
            if curl -fsS ${HEALTH_URL} >/dev/null; then
              status="$(curl -sS -o /dev/null -w "%{http_code}" ${HEALTH_URL}/api/auth/me)"
              if [ "$status" = "401" ]; then
                echo "Health check passed on attempt ${attempt}."
                exit 0
              fi
              echo "Frontend is up but API returned HTTP ${status}; retrying..."
            else
              echo "Application is not ready yet; retrying..."
            fi
            sleep 5
          done

          echo "Health check failed after waiting for the application to become ready."
          exit 1
        '''
      }
    }
  }

  post {
    success {
      echo 'DEVA CI checks passed; deployment runs only for the deploy branch.'
    }
    failure {
      echo 'DEVA pipeline failed. Check the Jenkins console output.'
    }
  }
}
