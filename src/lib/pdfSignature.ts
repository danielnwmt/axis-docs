// Detects if a PDF file already contains a digital signature (ICP-Brasil or generic PAdES/CMS).
// Strategy: scan the raw bytes for PDF signature markers without parsing the whole document.
// Markers used by signed PDFs:
//  - "/Type /Sig"        → signature dictionary
//  - "/ByteRange"        → signature byte range (always present in signed PDFs)
//  - "/SubFilter /adbe.pkcs7" or "/ETSI.CAdES" → CMS/PAdES signature
//  - "/FT /Sig"          → signature form field

export async function isPdfSigned(file: File | Blob): Promise<boolean> {
  try {
    const buf = await file.arrayBuffer();
    // Decode as latin1 so binary bytes map 1:1 to chars (PDF dictionary keywords are ASCII).
    const bytes = new Uint8Array(buf);
    let text = "";
    const chunk = 65536;
    for (let i = 0; i < bytes.length; i += chunk) {
      text += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    const normalized = text.replace(/\s+/g, " ");
    const patterns = [
      /\/Type\s*\/Sig\b/,
      /\/ByteRange\s*\[/,
      /\/SubFilter\s*\/(adbe\.pkcs7|ETSI\.CAdES|ETSI\.RFC3161)/,
      /\/FT\s*\/Sig\b/,
    ];
    return patterns.some((re) => re.test(normalized));
  } catch {
    return false;
  }
}
