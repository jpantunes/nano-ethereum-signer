const ethsig = require("./main");

let runTest = async () => {
    var message      = "Hello!";
    var private_key  = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    var address      = ethsig.addressFromKey(private_key);
    var message_hash = ethsig.keccak(message);
    var signature    = await ethsig.signMessage(message_hash, private_key);
    var signer       = ethsig.signerAddress(message_hash, signature);

    console.log("private_key  :", private_key);
    console.log("address      :", address);
    console.log("message      :", message);
    console.log("message_hash :", message_hash);
    console.log("signature    :", signature);
    console.log("Verified?", signer === address);
}

runTest();