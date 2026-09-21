$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$utf8=New-Object Text.UTF8Encoding($false)
function P([string]$v,[string]$style='Normal') {
 return '<w:p><w:pPr><w:pStyle w:val="'+$style+'"/></w:pPr><w:r><w:t xml:space="preserve">'+[Security.SecurityElement]::Escape($v)+'</w:t></w:r></w:p>'
}
$b=New-Object Text.StringBuilder
$inTable=$false
$head=$false
foreach($line in [IO.File]::ReadAllLines((Join-Path $PSScriptRoot 'Manual_clientes_e_roteiro_video.md'),$utf8)) {
 if($line.StartsWith('|')) {
  if($line -match '^\|[\s\-:|]+$'){continue}
  if(!$inTable){[void]$b.Append('<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5DF"/><w:left w:val="single" w:sz="4" w:color="CBD5DF"/><w:bottom w:val="single" w:sz="4" w:color="CBD5DF"/><w:right w:val="single" w:sz="4" w:color="CBD5DF"/><w:insideH w:val="single" w:sz="4" w:color="CBD5DF"/><w:insideV w:val="single" w:sz="4" w:color="CBD5DF"/></w:tblBorders><w:tblCellMar><w:top w:w="55" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="55" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>');$inTable=$true;$head=$true}
  [void]$b.Append('<w:tr><w:trPr><w:cantSplit/>')
  if($head){[void]$b.Append('<w:tblHeader/>')}
  [void]$b.Append('</w:trPr>')
  foreach($cell in $line.Trim().Trim('|').Split('|')){
   [void]$b.Append('<w:tc><w:tcPr>')
   if($head){[void]$b.Append('<w:shd w:fill="E5EEF5"/>')}
   [void]$b.Append('</w:tcPr>');[void]$b.Append((P $cell.Trim() 'TableText'));[void]$b.Append('</w:tc>')
  }
  [void]$b.Append('</w:tr>');$head=$false;continue
 }
 if($inTable){[void]$b.Append('</w:tbl>');$inTable=$false}
 if([string]::IsNullOrWhiteSpace($line)){continue}
 if($line -eq '<!-- pagebreak -->'){[void]$b.Append('<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>');continue}
 if($line.StartsWith('### ')){[void]$b.Append((P $line.Substring(4) 'Heading2'));continue}
 if($line.StartsWith('## ')){[void]$b.Append((P $line.Substring(3) 'Subtitle'));continue}
 if($line.StartsWith('# ')){[void]$b.Append((P $line.Substring(2) 'Heading1'));continue}
 if($line.StartsWith('- ')){[void]$b.Append((P ([char]0x2022+' '+$line.Substring(2)) 'ListParagraph'));continue}
 if($line -match '^\d+\. '){[void]$b.Append((P $line 'ListParagraph'));continue}
 [void]$b.Append((P $line))
}
if($inTable){[void]$b.Append('</w:tbl>')}
$doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+$b.ToString()+'<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="960" w:right="1020" w:bottom="960" w:left="1020" w:header="400" w:footer="400"/></w:sectPr></w:body></w:document>'
$styles=@"
<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="263442"/><w:sz w:val="21"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="85" w:line="252" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="200"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="173D58"/><w:sz w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="75"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="236582"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:sz w:val="28"/><w:color w:val="236582"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="55"/><w:ind w:left="160"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="25" w:line="218" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>
</w:styles>
"@
$parts=@{
 '[Content_Types].xml'='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'
 '_rels/.rels'='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
 'word/document.xml'=$doc
 'word/styles.xml'=$styles
 'word/_rels/document.xml.rels'='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'
 'word/header1.xml'='<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="236582"/></w:pBdr></w:pPr><w:r><w:rPr><w:color w:val="236582"/><w:sz w:val="17"/></w:rPr><w:t>CONTROLE DE ESTOQUE | Guia para clientes e vídeo</w:t></w:r></w:p></w:hdr>'
 'word/footer1.xml'='<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">13/09/2026 | Página </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>'
 'docProps/core.xml'='<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Controle de Estoque - Funcionalidades por usuário e roteiro de vídeo</dc:title><dc:creator>Documentação do projeto</dc:creator><dc:language>pt-BR</dc:language></cp:coreProperties>'
}
foreach($entry in $parts.GetEnumerator()){$null=[xml]$entry.Value}
$outputPath=Join-Path $PSScriptRoot 'Manual_clientes_e_roteiro_video.docx'
$stream=[IO.File]::Open($outputPath,[IO.FileMode]::Create)
$zip=New-Object IO.Compression.ZipArchive($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try{foreach($part in $parts.GetEnumerator()){$entry=$zip.CreateEntry($part.Key);$writer=New-Object IO.StreamWriter($entry.Open(),$utf8);try{$writer.Write($part.Value)}finally{$writer.Dispose()}}}finally{$zip.Dispose();$stream.Dispose()}
$check=[IO.Compression.ZipFile]::OpenRead($outputPath)
try{
 foreach($entry in $check.Entries){$reader=New-Object IO.StreamReader($entry.Open(),$utf8);try{$null=[xml]$reader.ReadToEnd()}finally{$reader.Dispose()}}
 Write-Output "DOCX validado: $($check.Entries.Count) partes XML."
 $xml=[xml]$doc
 $ns=New-Object Xml.XmlNamespaceManager($xml.NameTable)
 $ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
 Write-Output "Tabelas: $($xml.SelectNodes('//w:tbl',$ns).Count). Seções paginadas: $($xml.SelectNodes('//w:br',$ns).Count+1)."
 if($xml.InnerText -match 'Mariah2102|123456|Cadasstrados'){throw 'Conteúdo inesperado encontrado.'}
}finally{$check.Dispose()}
Get-Item -LiteralPath $outputPath | Select-Object FullName,Length