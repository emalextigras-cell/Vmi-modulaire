import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRows, getColumnMapping, recFrom, isCsvFile } from '../js/modules/dataio.js';

test('parse les champs CSV entre guillemets contenant une virgule décimale',()=>{
 const rows=parseCsvRows('Date,Temp,Hum\r\n10/11/2026 16:45:35,"09,3",73\r\n');
 assert.equal(rows[1][1],'09,3');
 assert.equal(rows[1][2],'73');
});

test('importe un CSV VMI+ natif avec ses 124 colonnes et sans SheetJS',()=>{
 const headers=Array(124).fill('');
 headers[0]='Date';headers[2]='Vol(m3)';headers[22]='Vitesse';headers[23]='Debit';headers[24]='Cons Dp';
 headers[25]='Tachy (rpm)';headers[26]='PWM (1/1000)';headers[117]='Temp';headers[118]='Hum rel';
 const values=Array(124).fill('');
 values[0]='10/11/2026 16:45:35';values[2]='337';values[22]='3';values[23]='121';values[24]='112';
 values[25]='1376';values[26]='348';values[117]='"19,7"';values[118]='"62,0"';
 const source=['ligne info 1','ligne info 2','ligne info 3',headers.join(','),values.join(',')].join('\n');
 const rows=parseCsvRows(source);
 const mapping=getColumnMapping(rows[3]);
 const record=recFrom(rows[4],null,mapping);
 assert.ok(record);
 assert.equal(record.volumeRaw,337);
 assert.equal(record.vmiSpeedRaw,3);
 assert.equal(record.debit,121);
 assert.equal(record.rpm,1376);
 assert.equal(record.vmiPwmRaw,348);
 assert.equal(record.st,19.7);
 assert.equal(record.sh,62);
 assert.equal(record.vit,null);
});




test('reconnaît les fichiers CSV, quelle que soit la casse',()=>{
 assert.equal(isCsvFile('export.csv'),true);
 assert.equal(isCsvFile('EXPORT.CSV'),true);
 assert.equal(isCsvFile('export.xlsx'),false);
 assert.equal(isCsvFile('export.csv.tmp'),false);
});
