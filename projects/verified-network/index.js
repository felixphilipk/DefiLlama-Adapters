const ethers = require('ethers');
const sdk = require('@defillama/sdk');
const fs = require('fs');

const primaryIssueManagerData = JSON.parse(fs.readFileSync('./PrimaryIssueManager.json', 'utf8'));
const primaryIssueManagerABI = primaryIssueManagerData.abi;
const secondaryIssueManagerData = JSON.parse(fs.readFileSync('./SecondaryIssueManager.json', 'utf8'));
const secondaryIssueManagerABI = secondaryIssueManagerData.abi;

const contracts = {
    goerli: {
        primary: '0x57E416421ffCDF26d630F2bf36776Dc019A9Dc02',
        secondary: '0x252b67835032D25b3913571446EDB0d1597D2DFf',
    },
    polygon: {
        primary: '0xDA13BC71FEe08FfD523f10458B0e2c2D8427BBD5',
        secondary: '0xbe7a3D193d91D1F735d14ec8807F20FF2058f342',
    },
};

const chainsProviders = {
    goerli: 'https://goerli.infura.io/v3/324d7d968bb245e39b4edcda5a16c7a4',
    polygon: 'https://polygon-mainnet.infura.io/v3/324d7d968bb245e39b4edcda5a16c7a4',
};

async function getChainBlocks(chain) {
    const provider = new ethers.providers.JsonRpcProvider(chainsProviders[chain]);
    const blockNumber = await provider.getBlockNumber();
    return blockNumber;
}

async function getEvents(chain, contractAddress, abi, eventName, fromBlock, toBlock) {
    const provider = new ethers.providers.JsonRpcProvider(chainsProviders[chain]);
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const filter = contract.filters[eventName]();
    const logs = await provider.getLogs({
        fromBlock,
        toBlock,
        address: contractAddress,
        topics: filter.topics,
    });

    return logs.map(log => contract.interface.parseLog(log));
}

async function tvl(timestamp) {
    let totalTVL = ethers.BigNumber.from('0');
    const balances = {};
    const chains = ['goerli', 'polygon'];

    for (let chain of chains) {
        const fromBlock = 0;  // Adjust as per your requirements
        const toBlock = await getChainBlocks(chain);

        const primaryEvents = await getEvents(chain, contracts[chain].primary, primaryIssueManagerABI, 'subscribers', fromBlock, toBlock);

        primaryEvents.forEach(event => {
            const cashSwapped = ethers.BigNumber.from(event.args.cashSwapped);
            const currency = event.args.currency;
            totalTVL = totalTVL.add(cashSwapped);
            sdk.util.sumSingleBalance(balances, currency, cashSwapped.toString());
        });

        const secondaryEvents = await getEvents(chain, contracts[chain].secondary, secondaryIssueManagerABI, 'subscribers', fromBlock, toBlock);

        secondaryEvents.forEach(event => {
            const amount = ethers.BigNumber.from(event.args.amount);
            totalTVL = totalTVL.add(amount);
            sdk.util.sumSingleBalance(balances, event.args.currencySettled, amount.toString());
        });

        balances.totalTVL = totalTVL.toString();
        console.log('Primary events:', primaryEvents);
        console.log('Secondary events:', secondaryEvents);
    }

    return balances;
}

module.exports = {
    methodology: '...', // Include an appropriate description of the methodology
    ethereum: {
        tvl: tvl, // Export the tvl function
    },
};

// Call the tvl function for testing
tvl('testTimestamp')
  .then(result => console.log(result))
  .catch(error => console.error(error));
