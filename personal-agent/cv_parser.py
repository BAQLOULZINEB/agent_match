#!/usr/bin/env python3
"""Extract a local PDF CV into conservative, reviewable JSON.

The parser never infers missing facts. It keeps raw section lines alongside the
small set of contact fields that can be recognized deterministically.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Iterable


SECTION_ALIASES = {
    "skills": {"skills", "technical skills", "competences", "compétences", "compétences techniques", "competences techniques", "compétences informatiques", "technologies"},
    "experience": {"experience", "experiences", "expérience", "expériences", "expérience professionnelle", "expériences professionnelles", "experience professionnelle", "experiences professionnelles", "professional experience", "professional experiences", "work experience"},
    "education": {"education", "formation", "formations", "formation académique", "formation academique", "parcours académique", "parcours academique", "academic background", "diplomes", "diplômes"},
    "projects": {"projects", "projets", "projets académiques", "projets academiques", "projets personnels", "personal projects", "academic projects"},
    "languages": {"languages", "langues", "compétences linguistiques", "competences linguistiques"},
}


def extract_pdf_text(pdf_path: Path) -> tuple[str, int]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise SystemExit("Dependency missing. Run: python -m pip install -r personal-agent/requirements.txt") from exc

    reader = PdfReader(str(pdf_path))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    return "\n\n".join(page for page in pages if page), len(reader.pages)


def normalize_heading(line: str) -> str | None:
    cleaned = re.sub(r"[^\wÀ-ÿ ]+", " ", line).strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    # Some PDF font maps replace accented glyphs with U+FFFD (for example
    # "COMP�TENCES"). Heading prefixes keep section recovery deterministic.
    if cleaned.startswith("projets") or cleaned.startswith("projects"):
        return "projects"
    if cleaned in {"soft skills", "hard skills"} or (cleaned.startswith("comp") and "tences" in cleaned):
        return "skills"
    for canonical, aliases in SECTION_ALIASES.items():
        if cleaned in aliases:
            return canonical
    return None


def unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        value = value.strip(" \t-•·|")
        key = value.casefold()
        if value and key not in seen:
            seen.add(key)
            output.append(value)
    return output


def parse_sections(text: str) -> dict[str, list[str]]:
    sections = {name: [] for name in SECTION_ALIASES}
    current: str | None = None
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            continue
        heading = normalize_heading(line)
        if heading:
            current = heading
            continue
        if current:
            sections[current].append(line)
    return {name: unique(lines) for name, lines in sections.items()}


def contact_info(text: str) -> dict[str, object]:
    emails = unique(re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.I))
    phones = unique(re.findall(r"(?<!\w)(?:\+?\d[\d .()\-]{7,}\d)", text))
    urls = unique(re.findall(r"https?://[^\s<>()]+|(?:www\.)?linkedin\.com/in/[^\s<>()]+|github\.com/[^\s<>()]+", text, re.I))
    return {
        "emails": emails,
        "phones": phones,
        "linkedin": [url for url in urls if "linkedin.com" in url.lower()],
        "github": [url for url in urls if "github.com" in url.lower()],
        "other_urls": [url for url in urls if "linkedin.com" not in url.lower() and "github.com" not in url.lower()],
    }


def skills(lines: list[str]) -> list[str]:
    values: list[str] = []
    for line in lines:
        candidate = re.sub(r"^[^:]{1,40}:\s*", "", line)
        values.extend(re.split(r"[,;|•·]", candidate))
    return unique(value for value in values if 1 < len(value.strip()) <= 80)


def parse_cv(text: str, source: str, pages: int) -> dict[str, object]:
    sections = parse_sections(text)
    return {
        "schema_version": 1,
        "source": source,
        "pages": pages,
        "contact": contact_info(text),
        "skills": skills(sections["skills"]),
        "experience": sections["experience"],
        "education": sections["education"],
        "projects": sections["projects"],
        "languages": sections["languages"],
        "review_required": True,
        "parser_notes": [
            "Deterministic extraction only; missing facts are not inferred.",
            "Review section boundaries and contact details before using this profile for tailoring.",
        ],
        "raw_text": text,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse a local PDF CV into Career Ops JSON.")
    parser.add_argument("pdf", type=Path, help="Path to the source PDF")
    parser.add_argument("--output", type=Path, default=Path("data/cv-profile.json"))
    args = parser.parse_args()
    if not args.pdf.is_file() or args.pdf.suffix.lower() != ".pdf":
        parser.error("pdf must point to an existing .pdf file")
    text, pages = extract_pdf_text(args.pdf)
    if not text.strip():
        raise SystemExit("No selectable text found. OCR the PDF first, then run the parser again.")
    payload = parse_cv(text, str(args.pdf.resolve()), pages)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Parsed {pages} page(s) into {args.output}. Review required before use.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
