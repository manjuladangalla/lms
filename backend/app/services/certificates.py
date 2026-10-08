"""Certificate generation: QR code + system PDF + pre-printed (print-mode) PDF."""
import io
from datetime import date, datetime

import qrcode
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.services.storage import upload_bytes

# Landscape letter (matches reportlab landscape(letter)) — coordinate space used by
# the admin template designer (frontend preview scales this same box).
PAGE_W, PAGE_H = landscape(letter)

DEFAULT_PRINT_TEMPLATE: dict = {
    "page": {"width": PAGE_W, "height": PAGE_H},
    "fields": {
        "heading": {"x": 396, "y": 470, "size": 26, "align": "center", "visible": True},
        "institute_name": {"x": 396, "y": 430, "size": 14, "align": "center", "visible": True},
        "student_name": {"x": 396, "y": 330, "size": 30, "align": "center", "visible": True},
        "programme_name": {"x": 396, "y": 255, "size": 20, "align": "center", "visible": True},
        "completion_date": {"x": 396, "y": 195, "size": 13, "align": "center", "visible": True},
        "final_grade": {"x": 396, "y": 165, "size": 13, "align": "center", "visible": True},
        "cert_no": {"x": 396, "y": 60, "size": 11, "align": "center", "visible": True},
        "issuer": {"x": 640, "y": 60, "size": 11, "align": "center", "visible": True},
        "qr": {"x": 70, "y": 55, "size": 90, "align": "left", "visible": True},
    },
}

PRINT_FIELD_KEYS = [
    "heading",
    "institute_name",
    "student_name",
    "programme_name",
    "completion_date",
    "final_grade",
    "cert_no",
    "issuer",
]


def merge_template(stored: dict | None) -> dict:
    """Stored template doc merged over defaults (per-field partial updates OK)."""
    tpl = {k: {**v} for k, v in DEFAULT_PRINT_TEMPLATE.items()}
    tpl["fields"] = {k: {**v} for k, v in DEFAULT_PRINT_TEMPLATE["fields"].items()}
    if not stored:
        return tpl
    page = stored.get("page") or {}
    tpl["page"]["width"] = float(page.get("width") or PAGE_W)
    tpl["page"]["height"] = float(page.get("height") or PAGE_H)
    for key, vals in (stored.get("fields") or {}).items():
        base = tpl["fields"].get(key, {"x": 396, "y": 300, "size": 14, "align": "center", "visible": True})
        tpl["fields"][key] = {**base, **{k: v for k, v in vals.items() if v is not None}}
    return tpl


def _fmt_date(value) -> str:
    if isinstance(value, datetime):
        return value.strftime("%d %B %Y")
    if isinstance(value, date):
        return value.strftime("%d %B %Y")
    return str(value or "")


def build_print_values(doc: dict, institute_name: str, issuer: str) -> dict:
    """Resolve displayed strings for print mode — per-cert `print_values` override defaults."""
    overrides = doc.get("print_values") or {}
    final_grade = doc.get("final_grade")
    grade_str = f"{final_grade}%" if final_grade is not None else "—"
    defaults = {
        "heading": "CERTIFICATE OF COMPLETION",
        "institute_name": institute_name,
        "student_name": doc.get("student_name") or "",
        "programme_name": doc.get("programme_name") or "",
        "completion_date": _fmt_date(doc.get("completion_date")),
        "final_grade": f"Final Grade: {grade_str}",
        "cert_no": f"Certificate No: {doc.get('cert_no') or ''}",
        "issuer": f"Authorized by: {issuer}" if issuer else "",
    }
    for key in PRINT_FIELD_KEYS:
        if overrides.get(key):
            defaults[key] = overrides[key]
    return defaults


def generate_qr_image(verify_url: str) -> bytes:
    qr = qrcode.QRCode(version=None, box_size=10, border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _draw_text(c: canvas.Canvas, field: dict, text: str, default_align: str = "center") -> None:
    align = field.get("align") or default_align
    c.setFillColor(HexColor("#111827"))
    c.setFont("Helvetica-Bold" if field.get("bold") else "Helvetica", float(field.get("size") or 14))
    x, y = float(field.get("x", 0)), float(field.get("y", 0))
    if align == "center":
        c.drawCentredString(x, y, text)
    elif align == "right":
        c.drawRightString(x, y, text)
    else:
        c.drawString(x, y, text)


def generate_certificate_print_pdf(
    *,
    values: dict,
    template: dict,
    qr_image: bytes | None = None,
    verify_url: str = "",
) -> bytes:
    """White fill-in certificate positioned by the admin-configured template —
    align field positions with a physical pre-printed certificate."""
    fields = (template or DEFAULT_PRINT_TEMPLATE)["fields"]
    page = (template or DEFAULT_PRINT_TEMPLATE).get("page") or {"width": PAGE_W, "height": PAGE_H}
    w, h = float(page.get("width") or PAGE_W), float(page.get("height") or PAGE_H)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    # White sheet only — the pre-printed paper supplies any artwork/border.
    c.setFillColor(white)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    for key in PRINT_FIELD_KEYS:
        field = fields.get(key) or {}
        if not field.get("visible", True):
            continue
        text = str(values.get(key) or "")
        if text:
            _draw_text(c, field, text)

    qr_field = fields.get("qr") or {}
    if qr_field.get("visible", True) and qr_image:
        size = float(qr_field.get("size") or 90)
        c.drawImage(ImageReader(io.BytesIO(qr_image)), float(qr_field.get("x", 40)), float(qr_field.get("y", 40)), width=size, height=size)
        if verify_url:
            c.setFillColor(HexColor("#374151"))
            c.setFont("Helvetica", 7)
            c.drawString(float(qr_field.get("x", 40)), float(qr_field.get("y", 40)) - 10, verify_url)

    c.showPage()
    c.save()
    return buf.getvalue()


def generate_certificate_pdf(
    *,
    cert_no: str,
    student_name: str,
    programme_name: str,
    institute_name: str,
    completion_date: datetime | date | None,
    verify_url: str,
    issuer: str = "",
    final_grade: float | None = None,
    qr_image: bytes | None = None,
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(letter))
    w, h = landscape(letter)

    c.setFillColor(HexColor("#0f172a"))
    c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(HexColor("#1d4ed8"))
    c.rect(20, 20, w - 40, h - 40, fill=0, stroke=1)

    c.setFillColor(HexColor("#f8fafc"))
    c.setFont("Helvetica-Bold", 34)
    c.drawCentredString(w / 2, h - 90, "CERTIFICATE OF COMPLETION")

    c.setFont("Helvetica", 14)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawCentredString(w / 2, h - 125, institute_name)

    c.setFont("Helvetica", 16)
    c.setFillColor(HexColor("#e2e8f0"))
    c.drawCentredString(w / 2, h - 180, "This is to certify that")

    c.setFont("Helvetica-Bold", 30)
    c.setFillColor(HexColor("#fbbf24"))
    c.drawCentredString(w / 2, h - 225, student_name)

    c.setFont("Helvetica", 16)
    c.setFillColor(HexColor("#e2e8f0"))
    c.drawCentredString(w / 2, h - 265, "has successfully completed the programme")

    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(HexColor("#60a5fa"))
    c.drawCentredString(w / 2, h - 305, programme_name)

    date_str = _fmt_date(completion_date)

    c.setFont("Helvetica", 13)
    c.setFillColor(HexColor("#cbd5e1"))
    c.drawCentredString(w / 2, h - 350, f"Completion Date: {date_str}")

    if final_grade is not None:
        c.setFont("Helvetica", 13)
        c.setFillColor(HexColor("#cbd5e1"))
        c.drawCentredString(w / 2, h - 378, f"Final Grade: {final_grade}%")

    c.setFont("Helvetica-Bold", 13)
    c.setFillColor(HexColor("#f8fafc"))
    c.drawCentredString(w / 2, 70, f"Certificate No: {cert_no}")

    if issuer:
        c.setFont("Helvetica", 11)
        c.setFillColor(HexColor("#94a3b8"))
        c.drawCentredString(w / 2, 50, f"Authorized by: {issuer}")

    if qr_image:
        c.drawImage(ImageReader(io.BytesIO(qr_image)), w - 110, 38, width=64, height=64)
        c.setFont("Helvetica", 7)
        c.setFillColor(HexColor("#94a3b8"))
        c.drawCentredString(w - 78, 30, "Scan to verify")
    else:
        c.setFont("Helvetica", 8)
        c.setFillColor(HexColor("#64748b"))
        c.drawCentredString(w / 2, 35, f"Scan QR / visit to verify: {verify_url}")

    c.showPage()
    c.save()
    return buf.getvalue()


async def issue_certificate_assets(system_pdf: bytes, print_pdf: bytes, qr_png: bytes) -> dict:
    """Upload QR + both PDFs. Returns dict of URLs (values may be '' if storage down)."""
    qr_url = await upload_bytes(qr_png, "certificates/qr", "image/png")
    pdf_url = await upload_bytes(system_pdf, "certificates/pdf", "application/pdf")
    print_pdf_url = await upload_bytes(print_pdf, "certificates/print", "application/pdf")
    return {"qr_url": qr_url, "pdf_url": pdf_url, "print_pdf_url": print_pdf_url}
