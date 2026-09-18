# Benchmark Performance Evaluation

## Dataset Integrity

- Scenarios: 2
- Measured runs: 6
- Measured transactions: 600
- Successful measured transactions: 600
- Failed measured transactions: 0
- Observed measured success rate: 100.00%

The transaction totals above include measured benchmark transactions only. Evidence preparation transactions required by the recordAccess workload are intentionally excluded from the 600 measured transactions or the measured access interval.

## Experimental Setup

The experiment used Hyperledger Besu QBFT with four validator nodes and one RPC node in a local, single-host Docker integration environment. Prometheus (15-second scrape interval), Grafana, and the Python benchmark client provided monitoring and workload execution. Declared condition(s): 3/4_validators_active. Tested concurrency values: 100. Measured transactions per repetition: 100.

## Aggregate Results

| Condition | Operation | Concurrency | Mean TPS | TPS StdDev | Mean P50 (s) | Mean P95 (s) | Mean P99 (s) | Mean Gas | Failure Rate |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 3/4_validators_active | recordAccess | 100 | 3.9300 | 0.0639 | 17.3776 | 23.7340 | 24.9959 | 122867.2 | 0.00% |
| 3/4_validators_active | recordEvidence | 100 | 4.0033 | 0.0248 | 10.1860 | 24.5543 | 24.6001 | 97650.7 | 0.00% |

## Performance Interpretation

For recordEvidence, mean throughput increased from 4.0033 TPS at concurrency 100 to 4.0033 TPS at concurrency 100. The tested range does not by itself establish a maximum system throughput.

For recordAccess, mean throughput increased from 3.9300 TPS at concurrency 100 to 3.9300 TPS at concurrency 100. The tested range does not by itself establish a maximum system throughput.

Average recordAccess gas usage was 122867.2, compared with 97650.7 for recordEvidence, an increase of approximately 25.8%.

Insufficient latency data was available for comparison.

evidence-c100 had the highest observed repetition-to-repetition TPS variability among recordEvidence scenarios (standard deviation 0.0248 TPS).

No measured transaction failures were observed in the 600 measured transactions. This is an observed result for the tested workload and environment and must not be interpreted as a guarantee of failure-free production operation.

Increasing concurrency increased completion throughput but did not materially reduce individual transaction completion latency, whose mean P95 values remained near 10 seconds. No clear throughput saturation was demonstrated within the tested concurrency values. The highest observed throughput is a result within the tested matrix, not evidence of a system capacity ceiling or production performance.

## Network Health During Benchmark

Network observations analyzed: 6.
All expected Besu targets matched the declared validator condition in every snapshot (3/4_validators_active).
All active monitored nodes reported synchronized in every snapshot.
Peer connectivity samples ranged from 3 to 3 direct peers. Peer count describes node connectivity and is not a QBFT quorum measurement.
Maximum observed per-snapshot block-height divergence: 2.
Block heights progressed between before and after snapshots for every observed run.
Prometheus targets are sampled asynchronously, so temporary block-height divergence alone is not evidence of a fork, consensus failure, or QBFT failure.

## Measurement Semantics

Throughput represents successful end-to-end benchmark operations divided by the measured run duration. The client waits for transaction receipts and the configured confirmation count, so this is completion throughput rather than raw RPC submission throughput.

Latency is measured from benchmark operation start until the blockchain client completes the transaction operation, including receipt and confirmation waiting.

For recordAccess, prerequisite evidence records are created before the measured interval. Their execution time and gas usage are not included in recordAccess latency or throughput statistics.

Gas usage is reported as a smart-contract execution and resource metric. It is not interpreted as a public-mainnet monetary transaction cost.

## Experimental Scope and Limitations

This is a local controlled integration benchmark whose components operated in a single-host Docker environment. It is not a production benchmark.

The reported results therefore describe the observed performance of this prototype and configuration. They does not establish the capacity of Hyperledger Besu or QBFT in general.

Concurrency levels were limited to 100. Because the experiment did not continue until a clear throughput plateau or failure boundary was reached, the highest observed throughput is not a capacity limit.

The local single-host environment does not reproduce WAN latency, packet loss, multi-host storage behavior, production authentication, TLS overhead, load balancing, unplanned validator or node failures, or network partitions beyond the declared experimental condition.

Temporary Prometheus block-height differences may occur because individual Besu targets are scraped at different times while the chain continues producing blocks. Block-height divergence must therefore be interpreted together with synchronization state, peer connectivity, chain progress, and transaction outcomes. Long-duration stress and state-growth behavior were not tested.

## Reproducibility

Run the analyzer from the repository root:

```text
python network/besu/scripts/analyze-benchmark-results.py \
  network/besu/benchmarks/results/<matrix-directory>
```

The analysis directory contains `aggregate.csv`, `aggregate.json`, and `benchmark-report.md`.
