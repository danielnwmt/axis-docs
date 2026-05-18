// Detects digital signatures in PDF files.
// Two levels:
//  - isPdfSigned(): any PAdES/CMS signature
//  - isPdfIcpBrasilSigned(): signature emitted by ICP-Brasil PKI
//
// ICP-Brasil detection markers (embedded in the CMS/PKCS#7 signature blob):
//  - OID prefix "2.16.76.1" → all ICP-Brasil certificate policies/extensions
//  - Issuer/Subject strings: "ICP-Brasil", "ICPBRASIL", "AC Raiz Brasileira",
//    "Autoridade Certificadora Raiz Brasileira"
//  - ITI (Instituto Nacional de Tecnologia da Informação) as issuer

async function readPdfAsLatin1(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let text = "";
  const chunk = 65536;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return text;
}

export async function isPdfSigned(file: File | Blob): Promise<boolean> {
  try {
    const text = await readPdfAsLatin1(file);
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

export async function isPdfIcpBrasilSigned(file: File | Blob): Promise<boolean> {
  try {
    if (!(await isPdfSigned(file))) return false;
    const text = await readPdfAsLatin1(file);
    // Search raw bytes — strings inside the CMS blob survive latin1 decoding.
    const icpMarkers = [
      /ICP-?Brasil/i,
      /ICPBRASIL/i,
      /AC\s+Raiz\s+Brasileira/i,
      /Autoridade\s+Certificadora\s+Raiz\s+Brasileira/i,
      /Instituto\s+Nacional\s+de\s+Tecnologia\s+da\s+Informa/i,
      // OID 2.16.76.1 encoded as ASCII (rare) or as bytes (60 86 48 01)
      /2\.16\.76\.1/,
    ];
    if (icpMarkers.some((re) => re.test(text))) return true;

    // Look for the DER-encoded OID 2.16.76.1 (bytes: 0x60 0x86 0x48 0x01)
    // which appears inside every ICP-Brasil certificate extension.
    for (let i = 0; i < text.length - 3; i++) {
      if (
        text.charCodeAt(i) === 0x60 &&
        text.charCodeAt(i + 1) === 0x86 &&
        text.charCodeAt(i + 2) === 0x48 &&
        text.charCodeAt(i + 3) === 0x01
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
