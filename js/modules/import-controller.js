// Gestion de l'import des exports VMI+ CSV et Excel.
// Le parsing métier reste dans dataio.js ; ce module orchestre la lecture du fichier.
const XLSX_URLS = [
 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

export function createImportController({ $, showError, log, isCsvFile, parseCsvRows, findVmiHeaderRowIndex, getColumnMapping, recFrom, ingest }) {
 function loadScript(url, ms = 15000) {
  return new Promise((resolve, reject) => {
   const script = document.createElement('script');
   const timeout = setTimeout(() => { script.remove(); reject(new Error('délai dépassé')); }, ms);
   script.src = url;
   script.onload = () => { clearTimeout(timeout); resolve(); };
   script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('échec du chargement')); };
   document.head.appendChild(script);
  });
 }
 let xlsxPromise = null;
 function loadXLSX() {
  if (globalThis.XLSX) return Promise.resolve();
  if (!xlsxPromise) xlsxPromise = (async () => {
   for (const url of XLSX_URLS) {
    try { await loadScript(url); if (globalThis.XLSX) return; }
    catch (error) { log('SheetJS : ' + error.message + ' (' + url + ')'); }
   }
   throw new Error('Impossible de charger la bibliothèque de lecture : l’import CSV/Excel demande une connexion internet (une seule fois). Le téléchargement par Bluetooth n’en a pas besoin.');
  })().catch(error => { xlsxPromise = null; throw error; });
  return xlsxPromise;
 }
 $('fx').onchange=async e=>{
 const file=e.target.files&&e.target.files[0];if(!file)return;showError('');
 try{
  let rows,spreadsheet=null;
  if(isCsvFile(file.name)){
   $('importInfo').textContent='Lecture du CSV…';
   rows=parseCsvRows(await file.text());
  }else{
   $('importInfo').textContent='Chargement de la bibliothèque Excel…';
   await loadXLSX();spreadsheet=globalThis.XLSX;
   const wb=globalThis.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
   const sheet=wb.Sheets[wb.SheetNames[0]];
   if(!sheet)throw new Error('Aucune feuille trouvée.');
   rows=globalThis.XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});
  }
  const headerIndex=findVmiHeaderRowIndex(rows);
  if(headerIndex<0)throw new Error('En-tête VMI+ introuvable : les colonnes Date, mode et Debit doivent être présentes dans les 20 premières lignes. Aucun relevé n’a été importé.');
  const columnMapping=getColumnMapping(rows[headerIndex]);
  const recs=[];for(let i=headerIndex+1;i<rows.length;i++){const r=recFrom(rows[i],spreadsheet,columnMapping);if(r)recs.push(r)}
  ingest(recs,'Import');
 }catch(err){showError('Import impossible : '+err.message)}
 e.target.value='';
};
 return { loadXLSX };
}
