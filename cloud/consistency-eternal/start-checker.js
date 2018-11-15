const lineReader = require("readline").createInterface({
    input: require("fs").createReadStream("history.log")
});

let lines = 0;

lineReader.on("line", function (line) {
    lines += 1;
});

lineReader.on("close", function () {
    console.info(lines);
});