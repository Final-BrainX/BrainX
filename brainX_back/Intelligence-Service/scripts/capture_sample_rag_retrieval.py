#!/usr/bin/env python3
"""Capture sample RAG retrieval contexts without chat generation."""

from __future__ import annotations

import sys

from capture_sample_rag_outputs import main


def ensure_answer_mode() -> None:
    if "--answer-mode" not in sys.argv:
        sys.argv[1:1] = ["--answer-mode", "retrieval"]


if __name__ == "__main__":
    ensure_answer_mode()
    raise SystemExit(main())
