const BigNumber = require("bignumber.js");
const axios = require("axios");
const $ = require("cheerio");
const {
    spawnSync
} = require("child_process");

function floatToSatoshi(num) {
    return new BigNumber(num).shiftedBy(8).toNumber();
}

function satoshiToFloat(num) {
    return new BigNumber(num).shiftedBy(-8).toNumber();
}

// https://letsminezny.orz.hm/workers
// table:eq(1) > tbody > tr

const rpcs = {
    zny: {
        rpc: ["docker", "exec", "zenyd", "bitzeny-cli"],
        tableIndex: 0,
        minimum: 61
    },
    mona: {
        rpc: ["docker", "exec", "monad", "monacoin-cli"],
        tableIndex: 3,
        minimum: 44
    }
};

function spawnSyncMod(args, options) {
    return spawnSync(args[0], args.slice(1), options);
}

function ambigiousToString(unknown) {
    if (unknown instanceof Buffer) {
        return unknown.toString("utf8");
    } else {
        return `${unknown}`;
    }
}

function cutdown(bn, unit) {
    return new BigNumber(bn).dividedBy(unit).integerValue(1).times(unit);
}

const realArgs = process.argv.slice(2);
(async () => {
    const data = rpcs[realArgs[0] || "zny"];
    const html = (await axios("https://letsminezny.orz.hm/workers", {
        responseType: "text"
    })).data;
    const dom = $(html);
    let sum = new BigNumber(0);
    let shares = {};
    $(dom.find("table")[data.tableIndex]).find(`tbody > tr`).each((index, elem) => {
        const address = $($(elem).find("td")[0]).find("a").text();
        const soloShares = $($(elem).find("td")[1]).text();
        sum = sum.plus(soloShares);
        shares[address] = soloShares;
        console.log(`${address}: ${soloShares}`);
    });
    console.log(`Total Shares: ${+sum}`);
    const balanceStdout = ambigiousToString(spawnSyncMod([...data.rpc, "getbalance"]).stdout);
    const rounded = cutdown(balanceStdout, "0.1");
    console.log(`Total Balance: ${+rounded}`);
    if (rounded.lt(data.minimum)) {
        console.log("Must be more than 2 blocks to be awaiting");
        return;
    }
    let toSend = {};
    let totalSent = new BigNumber(0);
    // rounded * shares / sum
    for (let address in shares) {
        const rawNumber = rounded.times(shares[address]).dividedBy(sum);
        const toUse = cutdown(rawNumber, "0.05");
        if (toUse.eq(0)) {
            continue;
        }
        toSend[address] = toUse.toString();
        totalSent = totalSent.plus(toUse);
        console.log(`${address}: ${toUse.toString()}`);
    }
    console.log(`Total: ${totalSent.toString()}`);
    const sendmany = spawnSyncMod([...data.rpc, "sendmany", "", JSON.stringify(toSend), "1", "Sent from resend tool"]);
    console.log(ambigiousToString(sendmany.stdout));
    console.log(ambigiousToString(sendmany.stderr));
})().then(a => a, console.log);
