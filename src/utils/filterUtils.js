// src/utils/filterUtils.js
export function evaluateCondition(f, operator, s, colId) {
    if (!s) return true;
    const dateFields = ['createdAt', 'date', 'month', 'CreatedAt', 'lastReportTime', 'issued', 'stopped', 'start', 'end'];
    
    // Handle Dates
    if (dateFields.includes(colId) || (!isNaN(Date.parse(f)) && isNaN(f))) {
        const dateF = new Date(f).getTime();
        const dateS = new Date(s).getTime();
        if (!isNaN(dateF) && !isNaN(dateS)) {
            if (operator === "=") return new Date(f).toDateString() === new Date(s).toDateString();
            if (operator === "!=") return new Date(f).toDateString() !== new Date(s).toDateString();
            if (operator === ">") return dateF > dateS;
            if (operator === "<") return dateF < dateS;
            if (operator === ">=") return dateF >= dateS;
            if (operator === "<=") return dateF <= dateS;
        }
    }
    
    // Handle Numbers
    const numF = Number(f); 
    const numS = Number(s);
    if (!isNaN(numF) && !isNaN(numS) && String(s).trim() !== '') {
        if (operator === "=") return numF === numS;
        if (operator === "!=") return numF !== numS;
        if (operator === ">") return numF > numS;
        if (operator === "<") return numF < numS;
        if (operator === ">=") return numF >= numS;
        if (operator === "<=") return numF <= numS;
    }
    
    // Handle Strings
    let strF = String(f).toLowerCase(); 
    let strS = String(s).toLowerCase();
    if (operator === "contains") return strF.includes(strS);
    if (operator === "=") return strF === strS;
    if (operator === "!=") return strF !== strS;
    if (operator === ">") return strF > strS;
    if (operator === "<") return strF < strS;
    if (operator === ">=") return strF >= strS;
    if (operator === "<=") return strF <= strS;
    
    return true;
}