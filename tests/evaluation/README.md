# AI evaluation 操作與限制

目前真實 Provider calls=0。候選集 `candidates/manifest.json` 含 30 張自製去識別化圖片：正常 8、高風險 12、資訊不足 6、對抗 4；development 20／holdout 10。每個內容 family 只在一個 split。

**所有期望只是 B 擬定候選，reviewStatus=pending，annotator/reviewer=null。** 不是人類 ground truth，也不是模型已通過的證據。正常、假物流、假客服 Demo 指定在 development；正式執行 demo 模式每張三次。高風險 category 集合目前刻意待人工收斂，不能用寬鬆候選標籤宣稱分類準確。

圖片由 `scripts/prepare-evaluation.ts` 產生，無真實姓名、帳號或金融資料；所示網址為 example 類示範文字，程式不存取它們。工具拒絕覆寫已存在 manifest，避免破壞後續人工標註。若重建請另建立 dataset revision；不覆寫已使用 holdout。

## 不付費檢查

```sh
npm run eval:ai
npm run eval:ai -- --split holdout
npm run eval:ai -- --split demo
```

預設 dry-run，檢查 schema、切分與每張完整解碼，列出待人工覆核 caseId、每次 reservation 與該 split 最低 budget；不讀取 key、不呼叫 Provider。一般 npm test/CI 也不呼叫 AI。

## 付費前置與執行

1. 產品與覆核者逐張看圖；確認可分析性、可接受 score/level/category、可見證據、禁止推論、安全建議與來源／授權。填入實際 annotator/reviewer 並改 approved；不要由程式偽造人工通過。
2. `.env.local` 設定 `ANALYSIS_MODE=remote`、`AI_PROVIDER=openai`、`AI_MODEL=gpt-4.1-mini-2025-04-14`、`AI_API_KEY`；不要把 key 貼到聊天或 commit。
3. 使用者授權美元總額、最多外部 calls 及執行者後才執行。下列值是 placeholder，不能直接當授權：

```sh
npm run eval:ai -- --execute --split development --budget-usd APPROVED_USD --max-calls APPROVED_CALLS --authorized-by OPERATOR
```

若需要小量連線 smoke，用同格式建立有已核准圖片的較小 manifest，並傳 `--manifest path/to/manifest.json`。不可用空白圖片回 422 充當成功接通驗收。

每次執行唯一 runId，在 ignored `runs/` 保存所有 public 結果（只適用獲授權測試素材）、status／caseId／requestId／latency／usage／版本與待人工判讀。不保存 Provider raw response、key 或圖片副本。外部服務錯誤也列入分母。未知用量與成本不當成 0。

呼叫數預檢與每次 Provider 無 retry。工具依固定 Provider 邊界保留每次費用：一張 high-detail 圖片最多 6,144 patches × 1.62、application-controlled prompt／schema 16,384 UTF-8 bytes 上限、額外 4,096 framing tokens，以及 2,400 output tokens；目前每次保留 US$0.0160136。prompt／schema 超過已 review 的文字上限或切換模型時會 fail closed。超出 run budget 時不開始下一次呼叫；usage 未回傳時按整筆 reservation 計入。這仍是本工具的預檢與停止機制，並非 Provider 帳號級硬支出限制，也不涵蓋 Preview 或其他使用者呼叫。

費率與 image token 規則查核日 2026-09-05：input US$0.40／1M、output US$1.60／1M；`gpt-4.1-mini-2025-04-14` 的 high detail 使用 2,048px／6,144-patch sizing budget 與 1.62 multiplier。實際執行前應重核官方價格與帳號機制。[官方模型與價格](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[官方圖片 token 規則](https://developers.openai.com/api/docs/guides/images-vision#calculating-costs)

先 development，鎖定 model/prompt/dataset hash 後才跑 holdout。若看過 holdout 並調整 prompt，該集不再是未見驗收集。報告不自動標 pass：產品需覆核虛构理由、未查證斷言、語言、建議與對抗指令遵從。按 `docs/test-plan.md` 記錄低估、正常 high 誤報、資訊不足、全部 latency 與三輪 Demo；不足／錯誤不能只報成功案例延遲。

本機 evaluation 測 API 管線／Provider 時間；不代表瀏覽器上傳、Vercel cold/warm、手機或部署存取／成本控制已驗收。
