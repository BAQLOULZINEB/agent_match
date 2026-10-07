# System context — Career Ops with FreeLLMAPI

```mermaid
flowchart LR
    U[Candidate / Career Studio user]
    C[Career Ops\n127.0.0.1:3000]
    D[(Local profile, CV, offers, approvals)]
    F[FreeLLMAPI gateway\n127.0.0.1:3001]
    K[Kilo anonymous free]
    O[OVH anonymous free]
    H[AI Horde anonymous free]
    X[Optional direct/provider-key fallbacks]

    U -->|search, review, draft request| C
    C <--> D
    C -->|selected prompt context only\nOpenAI chat format| F
    F -->|health/rate-aware route| K
    F -->|fallback| O
    F -->|queued fallback| H
    C -. gateway failure fallback .-> X
    C -->|draft / explanation / visible error| U
```

Trust boundary: profile, tracker, drafts, secrets, and process records are local files. Only the selected prompt context leaves the machine. Anonymous provider privacy and retention policies apply to that content.
