# trade-republic-sync

Sincronizza automaticamente l'export CSV di Trade Republic in un Google Sheet,
sostituendo per intero il tab `TradeRepublic` ad ogni push. Scrive i numeri
come valori numerici veri via API (Sheets API), evitando i problemi di
parsing/locale che si hanno con l'import manuale da interfaccia (punto
decimale interpretato come separatore delle migliaia).

## Setup (una tantum)

### 1. Service account Google Cloud
1. Vai su https://console.cloud.google.com/, crea o seleziona un progetto.
2. Menu → API e servizi → Libreria → cerca **Google Sheets API** → Abilita.
3. Menu → API e servizi → Credenziali → Crea credenziali → **Account di servizio**.
   Dagli un nome (es. `trade-republic-sync`), nessun ruolo a livello di progetto è necessario.
4. Apri l'account di servizio appena creato → scheda **Chiavi** → Aggiungi chiave →
   Crea nuova chiave → formato **JSON** → si scarica un file `.json`.

### 2. Condividi il Google Sheet
Apri il tuo Google Sheet → **Condividi** → incolla l'email dell'account di
servizio (tipo `trade-republic-sync@nome-progetto.iam.gserviceaccount.com`,
la trovi nel file JSON scaricato, campo `client_email`) → ruolo **Editor**.

### 3. Repository GitHub
1. Crea un repository **privato** (contiene dati finanziari) e caricaci questi file.
2. Settings → Secrets and variables → Actions → **New repository secret**:
   - `GOOGLE_CREDENTIALS_JSON` → incolla l'intero contenuto del file JSON scaricato al punto 1.
   - `SPREADSHEET_ID` → l'ID del foglio, dalla URL: `docs.google.com/spreadsheets/d/QUESTO_È_L_ID/edit`

### 4. Foglio Google — colonne attese
`TradeRepublic` deve avere in riga 1 l'intestazione grezza (datetime, date,
account_type, ... mcc_code — lo script la riscrive comunque ad ogni sync).
`Portfolio_Summary` deve avere le colonne: Strumento, Tipo, N° Operazioni,
Quantità Totale, Investito Totale, Commissioni Totali, Transazione(€,prezzo
medio), % Portafoglio.

Il tab `Nuovo_Export` e le funzioni Apps Script di merge/import non servono
più: questo script fa un replace completo ad ogni sync.

## Uso ricorrente

Ogni volta che scarichi un nuovo export da Trade Republic:

1. Sostituisci il file `data/transactions.csv` in questo repo con il nuovo export.
2. Fai commit e push (oppure carica il file da interfaccia web GitHub).
3. Il workflow parte automaticamente, svuota e riscrive `TradeRepublic` con
   i dati aggiornati, e aggiunge in `Portfolio_Summary` eventuali nuovi
   strumenti mai visti prima.

Puoi anche lanciarlo manualmente da GitHub → tab **Actions** → workflow
"Sync Trade Republic to Google Sheets" → **Run workflow**, senza dover
modificare il file.

## Test in locale (opzionale)

```bash
pip install -r requirements.txt
export GOOGLE_CREDENTIALS_JSON="$(cat percorso/della/chiave.json)"
export SPREADSHEET_ID="il_tuo_id"
python scripts/sync_to_sheets.py
```
