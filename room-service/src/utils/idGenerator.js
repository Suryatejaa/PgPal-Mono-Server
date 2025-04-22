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

const generatePPR = () => {
    return `PPR${Math.floor(100000 + Math.random() * 900000)}`;
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
