# iPhone Safari／PWA 真機驗收

**歷史IPHONE_PWA_ACCEPTANCE = PASS（USER-MANUAL）。** 原始文件記錄使用者回報「iPhone Safari＋PWA 實機驗收：OK」，見[正式非AI報告](production-privacy-feedback-final-acceptance-2026-09-29.md#f-iphonepwa)。機型、iOS／Safari版本、時間、受測SHA／deployment及逐case明細未提供，不能把整體確認綁定目前新版UI。以下保留重驗步驟；逐case的NOT_RUN表示缺少該項可核對明細。

## 驗收前

測試網址為`https://scamshield-ai-fawn.vercel.app/`。`ff64705`已於2026-10-01部署並匿名確認新信箱；每次實機重驗仍先記錄當次正式deployment ID、完整Git SHA與安全狀態，不能由本機分支或舊報告推定受測版本。聯絡資訊應為90天／csfishy@gmail.com。

Google表單描述曾於2026-09-29匿名確認90天／舊公開Email／刪除與長期同意；新信箱對齊尚待獨立確認。真機仍須核對實際畫面與操作。

全程保持`ANALYSIS_ENABLED=false`、Production runtime control=`disabled`，不得為手機驗收啟用真AI。只用自製、無個資的JPEG／PNG（例如自行製作一張寫著「手機驗收」的測試圖），不要用自己的聊天、證件或OTP。先記錄允許的分析POST數與是否允許本次合成Google回覆；建議各流程共用同一次已產生的錯誤狀態，避免不必要重送。若無本次送出授權，Google送出步驟NOT_RUN。

「選圖沒有上傳」「沒有重送」「圖片／POST沒有快取」不能只靠肉眼。可由操作者以iPhone Safari Web Inspector的Network／Storage觀察，或以最少自有Request ID匹配server telemetry輔助核對；若無法取得證據，該項NOT_RUN，不能推定PASS。不要導出含Cookie、token、原圖或其他訪客流量的完整HAR。

## A. Safari基本流程

| ID | 使用者操作 | 預期／需記錄 | 狀態 |
| --- | --- | --- | --- |
| A1 | 真機Safari開canonical；不登入Vercel | 匿名首頁可用，記錄實際SHA／時間；若被平台攔截保留狀態與畫面 | NOT_RUN |
| A2 | 看首頁Beta及上傳前說明 | 可讀、無截斷；提醒遮蔽姓名、電話、帳號、信用卡、OTP，雲端AI處理及可能誤判 | NOT_RUN |
| A3 | 主動開Demo並切換各情境 | 清楚標為示範、正常互動、不送`/analyze`；低風險不代表安全 | NOT_RUN |
| A4 | 進Privacy及聯絡區 | 可讀90天政策、公開Email、mailto及複製；不自動寄信 | NOT_RUN |
| A5 | 首頁點意見回饋 | 先知道前往Google，主動開啟表單、沒有被popup阻擋而無提示 | NOT_RUN |
| A6 | 關閉外部表單／切回Safari原頁 | 能回到ScamShield，頁面與選圖狀態合理，不自動送分析 | NOT_RUN |

## B. 圖片與AI OFF

| ID | 使用者操作 | 預期／需記錄 | 狀態 |
| --- | --- | --- | --- |
| B1 | 選無個資測試PNG／JPEG | 圖片預覽可讀、沒有自動`/analyze`；記錄Network證據 | NOT_RUN |
| B2 | 明確按一次分析 | 只新增1個POST；AI OFF安全错误，非Demo結果／假成功 | NOT_RUN |
| B3 | 讀取錯誤與按複製Request ID | UUID可貼到本機暫存比對，與該HTTP回應一致；不要貼公開issue附原圖 | NOT_RUN |
| B4 | 錯誤狀態回饋 | Google表單Request ID／完整build SHA／「操作問題」預填正確；可找到Privacy聯絡 | NOT_RUN |
| B5 | 等待、返回頁面或切換前後景 | 沒有自動retry；新增請求數0，只有另一次明確手動分析才可能POST | NOT_RUN |
| B6 | 操作者核對自有遙測 | 每筆`providerEntered=false`；usage缺值記unknown，不把UI error當Provider0證據 | NOT_RUN |

## C. PWA安裝與使用

在Safari分享選單選「加入主畫面」；如iOS提供「Open as Web App／以Web App開啟」，保持開啟再加入。實際文字依裝置語言／iOS版本，記錄所見選單。[Apple官方操作](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)。

| ID | 操作 | 預期／需記錄 | 狀態 |
| --- | --- | --- | --- |
| C1 | 加入主畫面 | 名稱ScamShield（manifest短名）、圖示清楚；不可把沒有manifest的普通捷徑直接當合格PWA | NOT_RUN |
| C2 | 從主畫面圖示啟動 | 獨立視窗、沒有一般Safari網址工具列；記錄啟動畫面／版本 | NOT_RUN |
| C3 | PWA開首頁、Demo、Privacy | 行動尺寸可讀，必要按鈕／鍵盤focus可操作 | NOT_RUN |
| C4 | PWA回饋外開Google再返回 | 記錄實際外開容器（Safari／其他），可返回原PWA；不重送分析 | NOT_RUN |

## D. Service worker與離線／更新

現行worker僅預快取離線頁、manifest、icons及載入過的Next靜態資產；線上成功首頁可留作離線fallback。`/demo`、`/privacy`不是各自保證預快取的完整離線頁；Demo已載入且狀態仍在时可能繼續操作，首次或重新導航離線可顯示fallback。按這個實際行為驗收，不能把fallback冒充完整離線Demo。

| ID | 操作 | 預期／需記錄 | 狀態 |
| --- | --- | --- | --- |
| D1 | 保留確知舊SHA／worker的已安裝PWA，連網重開 | 記錄舊→新SHA／worker、更新提示、關閉重開後新版；沒有舊版裝置則NOT_RUN，不先刪資料再宣稱遷移通過 | NOT_RUN |
| D2 | 更新後走Demo／AI OFF錯誤 | 新UI可解析新錯誤契約；未知錯誤安全fallback，不在更新時自動重送 | NOT_RUN |
| D3 | 先線上載入首頁，再開飛航模式並確認Wi-Fi關閉，重開PWA | 可顯示已快取shell或離線fallback，Remote清楚要求網路，不提供假的分析結果 | NOT_RUN |
| D4 | 分別測已載入Demo與離線新導航Demo | 記錄是Demo可操作或離線fallback，以及先前載入條件；與實作一致才PASS | NOT_RUN |
| D5 | 檢查Cache Storage／Network | 沒有`/analyze`回應、上傳檔／blob內容／base64或分析結果；POST由網路處理、不被worker重播 | NOT_RUN |
| D6 | 回復網路並重新開啟 | 網頁恢復，不自動補送離線期間的分析；沒有留下未知舊cache攔截 | NOT_RUN |

## E. 重新整理與多視窗

| ID | 操作 | 預期／需記錄 | 狀態 |
| --- | --- | --- | --- |
| E1 | 選圖後、尚未送出時重新整理 | 不送出分析；選圖若清空屬預期，不能從儲存還原私人圖像 | NOT_RUN |
| E2 | AI OFF錯誤後重新整理 | 回首頁／初始狀態，不重送POST；不假定Request ID跨reload持久存在 | NOT_RUN |
| E3 | 同時開兩個Safari分頁，切換與關閉 | 每個分頁獨立，沒有背景重送、沒有結果串頁 | NOT_RUN |
| E4 | Safari與已安裝PWA同時開啟 | 返回、重開與更新不產生新分析；記錄各自worker／頁面版本 | NOT_RUN |

## F. iPhone上的Google回饋

| ID | 操作 | 預期／需記錄 | 狀態 |
| --- | --- | --- | --- |
| F1 | 未登入Google的Safari／PWA開回饋 | 表單可編輯，沒有強制登入；可選登入提示不等於登入要求 | NOT_RUN |
| F2 | 等待表單欄位可編輯後核對 | Request ID／build／type與來源頁相符，URL只有允許欄位且編碼正常，不帶圖片／全文／IP／secret | NOT_RUN |
| F3 | 一般無entry連結 | 同一正式表單可開啟，Request ID／build可空白；無檔案上傳 | NOT_RUN |
| F4 | 僅在本次已核准時提交1筆合成回覆，Email留空 | 送出成功，記錄本次時間；此前合成回覆不算本次提交，未核准則NOT_RUN | NOT_RUN |
| F5 | 送出確認頁／返回原站 | 看不到其他人的回覆摘要或試算表；能返回原頁，未新送分析 | NOT_RUN |
| F6 | 讀取回饋說明 | 90天、csfishy@gmail.com、刪除方式一致；Google管理者清理為人工流程，不假稱自動刪除 | NOT_RUN |

## G. 證據模板與判定

每次新增紀錄，不覆寫失敗。文件可放受控的驗收目錄，不上傳個人截圖；僅保留去識別測試畫面、精確錯誤與自有Request ID。

```text
Run ID／操作者：
iPhone機型：
iOS版本：
Safari版本（若無法取得，寫未取得）：
測試日期時間／時區：
Production完整Git SHA／deployment ID：
canonical URL：
ANALYSIS_ENABLED=false／runtime disabled確認時間與操作者：
舊PWA SHA／worker（無舊版則NOT_RUN）：
網路／Safari與PWA模式：
測試case ID：
PASS／FAIL／NOT_RUN及理由：
預期／實際結果：
分析POST數／每筆Request ID／providerEntered核對：
Google本次提交數：
安全截圖或錄影路徑／錯誤時間：
失敗HTTP status／最終route（若可取；不要留Cookie／token）：
復原網路、AI兩gate仍停用確認：
```

只有使用者提供真機結果、必要證據及所有適用項目完成後，才評估更新`IPHONE_PWA_ACCEPTANCE`。沒有舊worker或無法驗Network／cache的項目要明列NOT_RUN，不以桌面測試補造PASS。發現重送、內容快取、UI真bug或Provider進入時停止；記錄blocker，另開修正／review流程，不在本輪直接修Production。這份清單準備完成仍不代表真機gate、AI品質或公開Beta通過。
