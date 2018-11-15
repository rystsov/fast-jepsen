const lineReader = require("readline").createInterface({
    input: require("fs").createReadStream("history.log")
});

let lines = 0;

lineReader.on("line", function (line) {
    const parts = line.split(",");
    if (parts[2] == "wb") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
        const key = parts[3];
        const prev = parts[4];
        const next = parts[5];
        const value = parseInt(parts[6]);
    } else if (parts[2] == "rb") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
        const key = parts[3];
    } else if (parts[2] == "re") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
        const writeID = parts[3];
        const value = parseInt(parts[4]);
    } else if (parts[2] == "we") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
    } else if (parts[2] == "wc") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
    } else {
        throw new Error("FUCK: " + line);
    }
    
    lines += 1;
});

lineReader.on("close", function () {
    console.info(lines);
});