
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

export function performExport(dataToExport, columns, format, filenamePrefix, getVal = (row, colId) => row[colId]) {
    const visibleCols = columns.filter(c => c.show);
    const headers = visibleCols.map(c => c.label);
    const triggerDownload = (content, type, ext) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; 
        a.download = `${filenamePrefix}.${ext}`;
        a.click(); 
        URL.revokeObjectURL(url);
    };

    if (format === 'JSON') {
        const json = dataToExport.map(row => { 
            let obj = {}; 
            visibleCols.forEach(c => obj[c.label] = getVal(row, c.id)); 
            return obj; 
        });
        triggerDownload(JSON.stringify(json, null, 2), "application/json", "json");
        
    } else if (format === 'XML') {
        let xml = '<?xml version="1.0" encoding="UTF-8"?><rows>\n';
        dataToExport.forEach(row => {
            xml += '  <row>\n';
            visibleCols.forEach(c => { 
                const tag = c.label.replace(/[^a-zA-Z0-9]/g, '_'); 
                xml += `    <${escapeHTML(tag)}>${escapeHTML(getVal(row, c.id))}</${escapeHTML(tag)}>\n`; 
            });
            xml += '  </row>\n';
        });
        xml += '</rows>'; 
        triggerDownload(xml, "application/xml", "xml");
        
    } else if (format === 'HTML') {
        let html = '<table border="1"><thead><tr>'; 
        headers.forEach(h => html += `<th>${escapeHTML(h)}</th>`); 
        html += '</tr></thead><tbody>';
        dataToExport.forEach(row => { 
            html += '<tr>'; 
            visibleCols.forEach(c => html += `<td>${escapeHTML(getVal(row, c.id))}</td>`); 
            html += '</tr>'; 
        });
        html += '</tbody></table>'; 
        triggerDownload(html, "text/html", "html");
        
    } else if (format === 'TXT') {
        const txt = [headers.join('\t'), ...dataToExport.map(r => visibleCols.map(c => getVal(r, c.id) || '').join('\t'))].join('\n');
        triggerDownload(txt, "text/plain", "txt");
        
    } else if (format === 'PDF') {
        try {
            // Because we imported them at the top, they are already available locally
            const doc = new jsPDF();
            doc.text(`Export: ${filenamePrefix}`, 14, 15);
            
            const body = dataToExport.map(row => visibleCols.map(c => getVal(row, c.id) || ''));
            
            // Use autoTable directly
            autoTable(doc, { 
                head: [headers], 
                body: body, 
                startY: 20 
            }); 
            
            doc.save(`${filenamePrefix}.pdf`);
        } catch (err) {
            console.error("PDF Export failed:", err);
            alert("Failed to generate PDF.");
        }

    } else { 
        const csv = [headers.join(','), ...dataToExport.map(r => visibleCols.map(c => `"${String(getVal(r, c.id) || '').replace(/"/g, '""')}"`).join(','))].join('\n');
        triggerDownload(csv, "text/csv", "csv");
    }
}