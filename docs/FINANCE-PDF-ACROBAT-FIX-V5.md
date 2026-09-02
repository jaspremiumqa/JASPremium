# Finance PDF Acrobat Fix v5

The PDF generator now calculates `/Length` from the exact UTF-8 encoded bytes and builds the final PDF from a single concatenated `Uint8Array`. This avoids Acrobat failures caused by character-count/byte-count mismatches.

PDFs are downloaded directly and do not invoke the browser print dialog.

Cache version: `crm-v45-pdf-final`.


Final compatibility fix: PDF pages explicitly declare both /F1 Helvetica and /F2 Helvetica-Bold resources; generated streams and xref offsets are calculated from exact encoded bytes.
