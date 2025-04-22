let propertyCounter = 100000;
let roomCounter = 0;

const pad = (num, size = 6) => {
    return num.toString().padStart(size, '0');
};

const generatePPO = () => {
    return `PPO${Math.floor(100000 + Math.random() * 900000)}`;
};

const generatePPT = () => {
    return `PPT${Math.floor(100000 + Math.random() * 900000)}`;
};

const generatePPP = () => {
    propertyCounter++;
    return `PPP${propertyCounter}`; // Property ID
};

const generatePPR = (propertyId, ownerId) => {
    const propLast2 = propertyId.slice(-2);
    const ownerLast2 = ownerId.slice(-2);
    roomCounter++;
    return `PPR${propLast2}${ownerLast2}${pad(roomCounter, 3)}`;
};

const generateRITM = () => {
    return `RITM${Math.floor(100000 + Math.random() * 900000)}`;
};

module.exports = {
    generatePPO,
    generatePPT,
    generatePPP,
    generatePPR,
    generateRITM
};
