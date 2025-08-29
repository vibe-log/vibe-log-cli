flowchart LR
      subgraph Setup ["Getting your Claude Code Session Data Ready"]
          Start([🧑‍💻 Coding with<br/>Claude Code]) --> Select[Claude stores chats to<br/>📁 ~/.claude/projects]
        %%   Store --> Select[Select sessions<br/>to analyze]
          Select --> Method{Send via}
          Method -->|Automatic| Hooks[🪝 Claude hooks<br/>auto-sync]
          Method -->|Manual| Manual[📁 Choose sessions<br/> or projects]
          Hooks --> Privacy[🔒 <b>Open Source Privacy Layer</b><br/>Removes code & secrets<br/>Keeps only patterns]
          Manual --> Privacy
      end

      Privacy --> Choice{Choose how to<br/>analyze AI coding sessions}

      subgraph Cloud ["☁️ Cloud Mode"]
          C1[Upload patterns] --> C2[Server verification]
          C2 --> C3[AI analysis]
          C3 --> C4[📊 Web Dashboard]
      end

      subgraph Local ["💻 Local Mode"]
          L1[Stay offline<br/>Your Claude Code] --> L2[Local analysis<br/>using sub-agents]
          L2 --> L3[📄 HTML report]
      end

      Choice ==>|Online| Cloud
      Choice -.->|Offline| Local

      Cloud --> Result[✨ <b>Learn when you code best</b><br/>Track improvements<br/>Find patterns]
      Local --> Result