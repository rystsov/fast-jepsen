It looks like MongoDB 3.6.4 with strictest write and read concerns (majority/linearizability) violates linearizability and returns stale data when a former isolated primary rejoined the cluster.

Bug: https://jira.mongodb.org/browse/SERVER-35038

## How to reproduce the issue

1. clone this repo https://github.com/rystsov/consistency-mongodb.git
2. open a couple of terminals in consistency-mongodb
3. start the MongoDB cluster: `build-run-cluster.sh`
4. start Jepsen test: `build-run-jepsen.sh`
5. observer violation:

```
     :some-details
     "Process 307 read 65 but before read started it was already known that the value is at least 73"},
    :valid? false},
   "node3"
   {:timeline {:valid? true},
    :linear
    {:valid? false,
     :some-details
     "Process 10 read 1 but before read started it was already known that the value is at least 130"},
    :valid? false}},
  :failures ["node1" "node2" "node3"]},
 :valid? false}


Analysis invalid! (?????? ???
```

There is a single writer per key which writes values of an increasing sequence so in a linealizable system each read should be greater or equal to previous read. If we look into `jepsen/store/memdb/20180612T165047.000Z/node2/history.edn` we'll see that a reader read 73 and then another reader started reading and read 65 thus violating linearizability

```
{:type :invoke, :f :read, :value nil, :host "node3", :process 295, :time 33119025100}
...
{:type :ok, :f :read, :value 73, :host "node3", :process 295, :time 33372398800}
...
{:type :invoke, :f :read, :value nil, :host "node3", :process 307, :time 34403679100}
...
{:type :ok, :f :read, :value 65, :host "node3", :process 307, :time 35101938700}
```

## Details

 - HTTP interface on nodes so MongoDB's clients have different view during partitions
 - checking the monotonicity of reads instead of linearizability (violations of monotonicity implies violations of linearizability)