# Chapter 4 Benchmark Dataset

## Purpose

This directory is the processed/final dataset for Chapter 4. It supports tables, charts, and analysis comparing a 4/4-validator QBFT network with the steady-state 3/4-validator condition.

## Files

- `transaction-summary.csv`: four operation/validator-condition summary rows.
- `monitoring-summary.csv`: two condition-level monitoring summary rows.
- `monitoring-timeseries-clean.csv`: cleaned, exact-timestamp monitoring observations.
- `validation-report.md`: source reconciliation, cleaning-window derivation, and validation-target comparisons.

## Raw sources

Only these directories were used:

- `docs/benchmark/4v-c100/`
- `docs/benchmark/3v-c100/`
- `docs/benchmark/grafana_result_44/`
- `docs/benchmark/grafana_result_34/`

The raw transaction and Grafana export files remain unchanged.

## Transaction scope and method

The dataset contains 1,200 measured transactions: 100 transactions x 3 repetitions for each combination of `recordEvidence`/`recordAccess` and 4/4/3/4 validators. Confirmations are 1 and concurrency is 100. The `recordAccess` workload measures `AccessAction.DOWNLOAD`; it does not represent a combined VIEW-and-DOWNLOAD benchmark.

Submitted/successful/failed counts and gas were reconciled against every `transactions-*.csv`. Throughput and latency percentiles are arithmetic means of the three per-run values in `summary-*.json`, matching the experiment aggregate convention and the source `analysis/aggregate.csv` files.

## Monitoring cleaning rules

- All Grafana exports use exact timestamp alignment. No interpolation or forward-filling is applied.
- The 4/4 window is the longest contiguous 15-second interval where RPC and validators 1-4 are present in block-rate, block-interval, CPU, and resident-memory samples: **2026-09-19 21:30:00 to 2026-09-19 22:40:00** (281 rows).
- The 3/4 window is the longest contiguous 15-second interval where RPC and validators 1-3 are present and validator-4 is absent from those same samples: **2026-09-19 23:44:45 to 2026-09-20 01:09:30** (340 rows).
- The 3/4 start removes the 5-minute rolling transition after validator-4 stopped. The last retained row is 01:09:30 because validator-4 resident memory reappears at 01:09:45; that startup/recovery row is excluded. Validator-4's rolling block/CPU series reappear at 01:10:00.
- The 3/4 resource totals contain `rpc-node`, `validator-1`, `validator-2`, and `validator-3` only. Validator-4 is never included.
- Block production rate and process CPU use the exported rolling 5-minute rate series.
- RPC is the reference observer for block production rate and estimated block interval, avoiding node double-counting.
- CPU values remain in CPU cores. `besu_cpu_total_cores` is the sum across active Besu processes; the per-process value divides that total by 5 for 4/4 or 4 for 3/4.
- Memory values are Besu process resident memory in MiB. `besu_memory_total_mib` is the sum across active Besu processes.
- The TxPool export contains three columns named `rpc-node:9545`, one per layer. `rpc_txpool_total` sums all three layer values at each timestamp. The summary reports the maximum observed sampled value.

Timestamps are reproduced exactly as exported by Grafana. The CSV files do not encode a timezone, so this dataset does not add one.

## Metric definitions

| Column | Definition |
| --- | --- |
| `condition` / `validator_condition` | Network condition: 4/4 or 3/4 validators active. |
| `active_validators` | Number of active consensus validators. |
| `active_besu_processes` | Besu processes included in resource totals, including RPC. |
| `throughput_tps` | Mean of three per-run successful transaction throughputs. |
| `p50_latency_s`, `p95_latency_s`, `p99_latency_s` | Mean of the corresponding per-run latency percentile. |
| `mean_gas_used` | Mean gas used across successful measured transactions. |
| `block_rate_rpc_blocks_per_s` | RPC-observed `rate(ethereum_blockchain_height[5m])`. |
| `block_interval_rpc_s` | RPC-observed estimated average block interval from the Grafana export. |
| `besu_cpu_total_cores` | Sum of `rate(process_cpu_seconds_total[5m])` across included Besu processes. |
| `besu_cpu_mean_per_process_cores` | CPU total divided by active Besu process count. |
| `besu_memory_total_mib` | Sum of `process_resident_memory_bytes`, converted by the dashboard to MiB. |
| `besu_memory_mean_per_process_mib` | Resident-memory total divided by active Besu process count. |
| `rpc_txpool_total` | Sum of all RPC TxPool layer series at one sampled timestamp. |
| `rpc_txpool_max_observed` | Maximum sampled `rpc_txpool_total`; this is not configured capacity. |

## Transaction summary

| Operation | Condition | Submitted | Success rate | Throughput (TPS) | P50 (s) | P95 (s) | P99 (s) | Mean gas |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| recordEvidence | 4/4 | 300 | 100.00% | 5.4899 | 13.523 | 16.521 | 17.838 | 97650.36 |
| recordEvidence | 3/4 | 300 | 100.00% | 4.0033 | 10.186 | 24.554 | 24.600 | 97650.72 |
| recordAccess | 4/4 | 300 | 100.00% | 6.2959 | 11.318 | 15.424 | 15.462 | 122864.64 |
| recordAccess | 3/4 | 300 | 100.00% | 3.9300 | 17.378 | 23.734 | 24.996 | 122867.24 |

## Monitoring summary

| Condition | Block rate (blocks/s) | Block interval (s) | CPU mean / P95 / max (cores) | Memory mean / P95 / max (MiB) | RPC TxPool max observed |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4/4 | 0.2000 | 5.000 | 0.2602 / 0.5409 / 0.5833 | 2085.1 / 2208.0 / 2263.0 | 33 |
| 3/4 | 0.1200 | 8.336 | 0.1844 / 0.2561 / 0.3288 | 1648.3 / 1730.1 / 1883.0 | 44 |

## Measured server specification

- CPU: 4 cores
- RAM: 16 GB
- SSD: 300 GB
- Public IP: 1
- Domestic network: 1 Gbps shared
- International network: 400 Mbps shared
- Data transfer: unlimited

## Important interpretation notes

- TxPool maximum observed is not the total number of submitted transactions and is not TxPool capacity.
- CPU cores are not CPU percentage. A host-capacity percentage, if needed, must be calculated separately as `besu_cpu_total_cores / 4 * 100`.
- Besu process resident memory is not total host RAM usage; it excludes the OS and other platform processes.
- Lower total CPU and memory in 3/4 partly reflects one fewer Besu validator process. Use the per-process columns when comparing process-normalized utilization.
- Monitoring results describe this measured environment and must not be generalized to all Besu/QBFT deployments.

See `validation-report.md` for exact checks and target deltas.
