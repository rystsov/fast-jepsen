MongoDB 3.6.4 with strictest write and read concerns (majority/linearizability) works as expected.

## How to test MongoDB 

1. clone this repo https://github.com/rystsov/consistency-mongodb.git
2. open a couple of terminals in consistency-mongodb
3. start the MongoDB cluster: `build-run-cluster.sh`
4. start Jepsen test: `build-run-jepsen.sh`