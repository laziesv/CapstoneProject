# ผลการทดลองสมรรถนะบล็อกเชนภายใต้ความล้มเหลวของ validator

ข้อมูลดิบและผลวิเคราะห์ของการทดลองที่ใช้เขียนบทที่ 4 ของปริญญานิพนธ์
วัดสมรรถนะการบันทึกหลักฐานบนเครือข่าย Besu QBFT เปรียบเทียบสภาวะที่ validator
ครบ 4 โหนด กับสภาวะที่เหลือ 3 โหนด

ทำการทดลองวันที่ 18 กันยายน 2569 บนเครือข่ายที่ติดตั้งใช้งานจริง
ด้วยโค้ด benchmark จาก submodule `blockchain` commit `a35afc3`

## เงื่อนไขการทดลอง

| รายการ | ค่า |
|---|---|
| chain ID | 20260720 |
| คาบการปิดบล็อก | 5 วินาที |
| โหนด | validator 4 + rpc-node 1 |
| สัญญา | EvidenceRegistryV3 ที่ `0x013816048a9a9f5d636d1f614bafc5d07d25d3ce` |
| ธุรกรรมต่อรอบ | 100 รายการ ส่งพร้อมกันทั้งหมด |
| การยืนยัน | 1 บล็อก |
| ทำซ้ำ | 3 รอบต่อ scenario |
| scenario | `evidence-c100` (recordEvidence) และ `access-c100` (recordAccess) |

## โฟลเดอร์

| โฟลเดอร์ | สภาวะ | ใช้ในรายงาน |
|---|---|---|
| `4v-c100/` | validator ครบ 4 โหนด | ใช้ — เป็นชุดควบคุม |
| `3v-c100/` | validator 3 โหนด (ปิด validator-4) | ใช้ — เป็นชุดทดลอง |
| `4v-c100-void-rpccap80/` | 4 โหนด แต่ชนเพดาน connection | ไม่ใช้ — เก็บเป็นหลักฐานประกอบ |

ชุด `4v-c100-void-rpccap80` เก็บข้อมูลก่อนพบว่าค่าปริยาย
`rpc-http-max-active-connections=80` ของ Besu ต่ำกว่า concurrency 100 ที่การทดลองกำหนด
ทำให้ธุรกรรมลำดับที่ 76–100 ต่อไม่ติดตั้งแต่ชั้นการรับส่งข้อมูล
จึงปรับค่าเป็น 256 แล้วเก็บข้อมูลใหม่ทั้งหมด ชุดนี้เก็บไว้เพื่อความโปร่งใส ไม่นับเป็นผล
มีเพียง 4 รอบเพราะหยุดการทำงานทันทีที่พบสาเหตุ

## ไฟล์ในแต่ละโฟลเดอร์

แต่ละรอบการทดลองสร้างไฟล์ 5 ไฟล์ ใช้ `run_id` เป็นตัวเชื่อม

| ไฟล์ | เนื้อหา | ใช้ทำอะไร |
|---|---|---|
| `run-<run_id>.json` | ข้อมูลดิบทุกธุรกรรม ทั้ง tx hash เลขบล็อก เวลาเริ่ม เวลาจบ gas และสถานะ | ตรวจสอบย้อนกลับไปยังธุรกรรมจริงบนเชนได้ |
| `transactions-<run_id>.csv` | ธุรกรรมรายรายการในรูปตาราง | เปิดด้วย Excel วิเคราะห์เพิ่มเองได้ |
| `summary-<run_id>.json` | สถิติสรุปของรอบนั้น ทั้ง throughput, p50/p95/p99, gas และเงื่อนไขการทดลอง | เป็นข้อมูลนำเข้าของตัววิเคราะห์ |
| `network-<run_id>.json` | สถานะโหนดทั้ง 5 ก่อนและหลังรอบ พร้อมค่าตัวชี้วัดจาก Prometheus | **หลักฐานว่า validator-4 ดับจริงตอนวัดผล** |
| `metrics-timeseries-<run_id>.csv` | ค่าจาก Prometheus ตลอดช่วงที่วัด ทีละ 15 วินาที แยกตามโหนด | ใช้ทำกราฟ CPU หน่วยความจำ และคิวธุรกรรม |

### โฟลเดอร์ `analysis/`

สร้างโดย `analyze-benchmark-results.py` จากไฟล์ `summary-*.json` ทั้งหมดในโฟลเดอร์

| ไฟล์ | เนื้อหา |
|---|---|
| `aggregate.csv` | ตารางสรุปรวมทุกรอบ แยกตาม scenario — **เป็นที่มาของตัวเลขทุกตารางในบทที่ 4** |
| `aggregate.json` | ข้อมูลชุดเดียวกับ csv ในรูป JSON |
| `benchmark-report.md` | รายงานที่สคริปต์เขียนให้อัตโนมัติ มีทั้งตารางและการตีความ |

## ตัวชี้วัดใน metrics-timeseries

ไฟล์ CSV มี 5 คอลัมน์ คือ `timestamp`, `metric_name`, `instance`, `labels`, `value`
โดย `metric_name` มี 10 ค่า

| metric_name | ความหมาย |
|---|---|
| `node_up` | โหนดตอบสนองหรือไม่ (1 หรือ 0) |
| `block_height` | ความสูงของบล็อกที่โหนดนั้นเห็น |
| `peer_count` | จำนวนโหนดที่เชื่อมต่ออยู่ |
| `transaction_pool` | จำนวนธุรกรรมที่รอเข้าบล็อก |
| `chain_head_transaction_count` | จำนวนธุรกรรมในบล็อกล่าสุด |
| `jvm_memory_used_bytes` | หน่วยความจำที่ JVM ใช้ |
| `process_resident_memory_bytes` | หน่วยความจำที่กระบวนการใช้จริง |
| `process_cpu_rate` | อัตราการใช้หน่วยประมวลผล หน่วยเป็นคอร์ |
| `rpc_active_connections` | จำนวน connection HTTP ที่ RPC node รับอยู่ |
| `sync_status` | สถานะการซิงค์ของโหนด |

## ผลสรุป

| | evidence-c100 | | access-c100 | |
|---|---|---|---|---|
| | 4/4 | 3/4 | 4/4 | 3/4 |
| อัตราความสำเร็จ | 100% | 100% | 100% | 100% |
| ธุรกรรม/วินาที | 5.4899 | 4.0033 | 6.2959 | 3.9300 |
| p50 (วินาที) | 13.523 | 10.186 | 11.318 | 17.378 |
| p95 (วินาที) | 16.521 | 24.554 | 15.424 | 23.734 |
| p99 (วินาที) | 17.838 | 24.600 | 15.462 | 24.996 |

ธุรกรรมทั้ง 1,200 รายการสำเร็จครบในทั้งสองสภาวะ ห่วงโซ่การครอบครองจึงไม่ขาดตอน
แต่อัตราการบันทึกลดลงร้อยละ 27.08 และ 37.58 ส่วนเวลาหน่วงที่เปอร์เซ็นไทล์ 95
เพิ่มขึ้นร้อยละ 48.62 และ 53.88

## วิธีสร้างข้อมูลชุดนี้ซ้ำ

รันจากรากของ submodule `blockchain` โดยตั้งตัวแปรสภาพแวดล้อม
`RPC_URL`, `CHAIN_ID`, `CONTRACT_ADDRESS`, `WRITER_PRIVATE_KEY`, `PROMETHEUS_URL`
และ `ARTIFACT_PATH=artifacts/EvidenceRegistryV3.json`

```bash
# สภาวะ 4/4
python3 -u network/besu/scripts/benchmark-transactions.py \
  --scenario-file network/besu/benchmarks/scenarios-research-100.json \
  --output-directory network/besu/benchmarks/results/4v-c100 \
  --prometheus-url "$PROMETHEUS_URL" --prometheus-step-seconds 15

# สภาวะ 3/4 (ต้องหยุด validator-4 ก่อน)
python3 -u network/besu/scripts/benchmark-transactions.py \
  --scenario-file network/besu/benchmarks/scenarios-research-100.json \
  --output-directory network/besu/benchmarks/results/3v-c100 \
  --prometheus-url "$PROMETHEUS_URL" --prometheus-step-seconds 15 \
  --allowed-down-instance validator-4:9545

# วิเคราะห์
PYTHONPATH=$(pwd) python3 network/besu/scripts/analyze-benchmark-results.py \
  network/besu/benchmarks/results/4v-c100 --skip-matrix-validation
```

ต้องใส่ `--skip-matrix-validation` เพราะชุด scenario นี้เป็นชุดเฉพาะทาง 2 รายการ
ไม่ใช่ matrix เต็มที่ตัวตรวจสอบคาดไว้

ตัวรันจะตรวจสถานะโหนดทั้ง 5 ทั้งก่อนและหลังทุกรอบ หากสภาพไม่ตรงกับที่ประกาศไว้
รอบนั้นจะล้มเหลวทันที จึงรับประกันได้ว่าข้อมูลทุกไฟล์ในโฟลเดอร์นี้
เกิดขึ้นภายใต้สภาวะที่ระบุจริง

## หมายเหตุด้านความปลอดภัย

ไฟล์ทั้งหมดในโฟลเดอร์นี้ไม่มีกุญแจส่วนตัว รหัสผ่าน หรือข้อมูลส่วนบุคคล
ค่า hash ทั้งหมดเป็นค่าสังเคราะห์ที่สร้างขึ้นเฉพาะการทดลอง ไม่ใช่หลักฐานจริงของผู้ใช้
