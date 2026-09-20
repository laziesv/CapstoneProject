# Chapter 4 Dataset Validation Report

## Data quality checks

- PASS: measured transaction count is 1,200.
- PASS: measured transaction failures are 0.
- PASS: each operation/condition contains 3 repetitions of 100 measured transactions.
- PASS: `transaction-detail.csv` contains exactly 1,200 rows.
- PASS: `transaction-run-summary.csv` contains exactly 12 rows.
- PASS: each run contains exactly 100 measured transactions with sequence 1-100 and confirmations = 1.
- PASS: no duplicate `validator_condition + operation + repetition + sequence` key exists.
- PASS: all 1,200 transaction-detail rows are successful.
- PASS: run-level averages reconcile to `transaction-summary.csv` within output rounding tolerance.
- PASS: pooled latency percentiles were calculated and checked separately from mean-of-run percentiles.
- PASS: transaction summaries reconcile to each source `analysis/aggregate.csv` within output rounding.
- PASS: 3/4 CPU and memory totals include only RPC plus validators 1-3.
- PASS: the 3/4 transition and recovery samples were excluded by the observed validator-4 series state.
- PASS: monitoring metrics were joined on exact 15-second timestamps without interpolation.
- PASS: CPU remains in cores and memory remains in MiB.
- PASS: all three duplicate RPC TxPool layer columns were summed per timestamp.
- PASS: raw source SHA-256 values were unchanged during generation.

## Derived monitoring windows

| Condition | Start | End | Rows | Derivation |
| --- | --- | --- | ---: | --- |
| 4/4 | 2026-09-19 21:30:00 | 2026-09-19 22:40:00 | 281 | Longest contiguous period with RPC and validators 1-4 present |
| 3/4 | 2026-09-19 23:44:45 | 2026-09-20 01:09:30 | 340 | Longest contiguous period with RPC and validators 1-3 present and validator-4 absent from block-rate, interval, CPU, and resident-memory samples |

The 3/4 export first satisfies the steady-state rule at 23:44:45, after the 5-minute rolling metrics no longer contain validator-4. The last retained sample is 01:09:30. Validator-4 resident memory reappears at 01:09:45, so that recovery sample is excluded even though validator-4's rolling rate/CPU series do not reappear until 01:10:00.

## Transaction target comparison

| Operation | Condition | Metric | Actual | Target | Delta | Status |
| --- | --- | --- | ---: | ---: | ---: | --- |
| recordEvidence | 4/4 | success_rate_percent | 100.000000 | 100.000000 | +0.000000 | PASS |
| recordEvidence | 4/4 | throughput_tps | 5.489919 | 5.489900 | +0.000019 | PASS |
| recordEvidence | 4/4 | p50_latency_s | 13.522881 | 13.523000 | -0.000119 | PASS |
| recordEvidence | 4/4 | p95_latency_s | 16.521356 | 16.521000 | +0.000356 | PASS |
| recordEvidence | 4/4 | p99_latency_s | 17.838081 | 17.838000 | +0.000081 | PASS |
| recordEvidence | 4/4 | mean_gas_used | 97650.360000 | 97650.360000 | +0.000000 | PASS |
| recordEvidence | 3/4 | success_rate_percent | 100.000000 | 100.000000 | +0.000000 | PASS |
| recordEvidence | 3/4 | throughput_tps | 4.003307 | 4.003300 | +0.000007 | PASS |
| recordEvidence | 3/4 | p50_latency_s | 10.186035 | 10.186000 | +0.000035 | PASS |
| recordEvidence | 3/4 | p95_latency_s | 24.554266 | 24.554000 | +0.000266 | PASS |
| recordEvidence | 3/4 | p99_latency_s | 24.600136 | 24.600000 | +0.000136 | PASS |
| recordEvidence | 3/4 | mean_gas_used | 97650.720000 | 97650.720000 | +0.000000 | PASS |
| recordAccess | 4/4 | success_rate_percent | 100.000000 | 100.000000 | +0.000000 | PASS |
| recordAccess | 4/4 | throughput_tps | 6.295918 | 6.295900 | +0.000018 | PASS |
| recordAccess | 4/4 | p50_latency_s | 11.318120 | 11.318000 | +0.000120 | PASS |
| recordAccess | 4/4 | p95_latency_s | 15.423576 | 15.424000 | -0.000424 | PASS |
| recordAccess | 4/4 | p99_latency_s | 15.462405 | 15.462000 | +0.000405 | PASS |
| recordAccess | 4/4 | mean_gas_used | 122864.640000 | 122864.640000 | +0.000000 | PASS |
| recordAccess | 3/4 | success_rate_percent | 100.000000 | 100.000000 | +0.000000 | PASS |
| recordAccess | 3/4 | throughput_tps | 3.930036 | 3.930000 | +0.000036 | PASS |
| recordAccess | 3/4 | p50_latency_s | 17.377639 | 17.378000 | -0.000361 | PASS |
| recordAccess | 3/4 | p95_latency_s | 23.733953 | 23.734000 | -0.000047 | PASS |
| recordAccess | 3/4 | p99_latency_s | 24.995867 | 24.996000 | -0.000133 | PASS |
| recordAccess | 3/4 | mean_gas_used | 122867.240000 | 122867.240000 | +0.000000 | PASS |

## Run-level validation

The throughput standard deviation is the sample standard deviation across the three repetitions, matching the source aggregate convention.

| Operation | Condition | Runs | Mean latency actual (s) | Target (s) | Throughput stddev actual (TPS) | Target (TPS) | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| recordEvidence | 4/4 | 3 | 13.290472 | 13.290473 | 0.812305 | 0.812305 | PASS |
| recordEvidence | 3/4 | 3 | 16.635475 | 16.635475 | 0.024816 | 0.024816 | PASS |
| recordAccess | 4/4 | 3 | 12.953366 | 12.953366 | 0.000972 | 0.000972 | PASS |
| recordAccess | 3/4 | 3 | 20.161838 | 20.161838 | 0.063920 | 0.063920 | PASS |

## Run-level reconciliation to transaction summary

For each operation/condition, the arithmetic mean of the three run rows was compared with `transaction-summary.csv` for throughput, P50, P95, P99, and mean gas. The table reports the largest absolute throughput/latency delta among those four rate/latency metrics; gas is shown separately because it has a different unit.

| Operation | Condition | Maximum absolute throughput/latency delta | Mean-gas delta | Status |
| --- | --- | ---: | ---: | --- |
| recordEvidence | 4/4 | 0.000000333 | 0.000000 | PASS |
| recordEvidence | 3/4 | 0.000000344 | 0.000000 | PASS |
| recordAccess | 4/4 | 0.000000462 | 0.000000 | PASS |
| recordAccess | 3/4 | 0.000000667 | 0.000000 | PASS |

These sub-micro-unit differences result from averaging values serialized to the run-summary output precision. They are below the six-decimal rounding tolerance and do not indicate a source discrepancy.

## Pooled transaction latency validation

These percentiles use all 300 transaction observations per operation/condition. They are validation-only pooled statistics and do not replace the mean of per-run percentiles in `transaction-summary.csv`.

| Operation | Condition | Pooled P50 actual (s) | Target (s) | Pooled P95 actual (s) | Target (s) | Pooled P99 actual (s) | Target (s) | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| recordEvidence | 4/4 | 14.590257 | 14.590257 | 19.412771 | 19.412771 | 19.505089 | 19.505089 | PASS |
| recordEvidence | 3/4 | 10.268159 | 10.268159 | 24.601545 | 24.601545 | 24.683465 | 24.683465 | PASS |
| recordAccess | 4/4 | 11.355194 | 11.355194 | 15.433074 | 15.433074 | 15.519129 | 15.519129 | PASS |
| recordAccess | 3/4 | 20.458192 | 20.458192 | 25.262619 | 25.262619 | 25.340570 | 25.340570 | PASS |

## Monitoring target comparison

| Condition | Metric | Actual | Target | Delta | Status |
| --- | --- | ---: | ---: | ---: | --- |
| 4/4 | block_rate_mean_blocks_per_s | 0.200000 | 0.200000 | +0.000000 | PASS |
| 4/4 | block_interval_mean_s | 5.000000 | 5.000000 | +0.000000 | PASS |
| 4/4 | besu_cpu_mean_cores | 0.260178 | 0.260200 | -0.000022 | PASS |
| 4/4 | besu_cpu_p95_cores | 0.540900 | 0.540900 | +0.000000 | PASS |
| 4/4 | besu_cpu_max_observed_cores | 0.583300 | 0.583300 | +0.000000 | PASS |
| 4/4 | besu_memory_mean_mib | 2085.089000 | 2085.000000 | +0.089000 | PASS |
| 4/4 | besu_memory_p95_mib | 2208.000000 | 2208.000000 | +0.000000 | PASS |
| 4/4 | besu_memory_max_observed_mib | 2263.000000 | 2263.000000 | +0.000000 | PASS |
| 4/4 | rpc_txpool_max_observed | 33.000000 | 33.000000 | +0.000000 | PASS |
| 3/4 | block_rate_mean_blocks_per_s | 0.120000 | 0.120000 | +0.000000 | PASS |
| 3/4 | block_interval_mean_s | 8.336000 | 8.335000 | +0.001000 | PASS |
| 3/4 | besu_cpu_mean_cores | 0.184445 | 0.184500 | -0.000055 | PASS |
| 3/4 | besu_cpu_p95_cores | 0.256100 | 0.256000 | +0.000100 | PASS |
| 3/4 | besu_cpu_max_observed_cores | 0.328800 | 0.328800 | +0.000000 | PASS |
| 3/4 | besu_memory_mean_mib | 1648.253000 | 1648.000000 | +0.253000 | PASS |
| 3/4 | besu_memory_p95_mib | 1730.100000 | 1730.000000 | +0.100000 | PASS |
| 3/4 | besu_memory_max_observed_mib | 1883.000000 | 1883.000000 | +0.000000 | PASS |
| 3/4 | rpc_txpool_max_observed | 44.000000 | 44.000000 | +0.000000 | PASS |

## Additional checks

- Maximum absolute row-level difference between exported RPC block interval and `1 / exported RPC block rate`: 4/4 = 0.000000 s; 3/4 = 0.023361 s. Small differences reflect Grafana CSV display rounding.
- Clean monitoring rows: 621 (281 for 4/4 and 340 for 3/4).
- No missing values were invented and no interpolation was performed.
- Validation targets are approximate comparison points, not inputs to the calculations.
