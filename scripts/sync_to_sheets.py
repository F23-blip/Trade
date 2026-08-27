"""
Sincronizza data/transactions.csv (export grezzo di Trade Republic) con un
Google Sheet, scrivendo i numeri come valori numerici veri via API (bypassa
il parsing testuale/locale che causava i numeri corrotti nell'import manuale).

Strategia: FULL REPLACE. Trade Republic esporta sempre tutto lo storico dalla
prima transazione, quindi ad ogni sync il tab "TradeRepublic" viene svuotato
e riscritto per intero con l'ultimo CSV. Nessun dedup necessario: il file è
sempre la fonte di verità completa.

Variabili d'ambiente richieste:
  GOOGLE_CREDENTIALS_JSON  -> contenuto del JSON della service account
  SPREADSHEET_ID           -> ID del Google Sheet (dall'URL, tra /d/ e /edit)
"""

import os
import json
import pandas as pd
import gspread
from google.oauth2.service_account import Credentials

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

CSV_PATH = "data/transactions.csv"
SHEET_TRADEREPUBLIC = "TradeRepublic"
SHEET_PORTFOLIO = "Portfolio_Summary"

HEADER = [
    "datetime", "date", "account_type", "category", "type", "asset_class",
    "name", "symbol", "shares", "price", "amount", "fee", "tax", "currency",
    "original_amount", "original_currency", "fx_rate", "description",
    "transaction_id", "counterparty_name", "counterparty_iban",
    "payment_reference", "mcc_code",
]

NUMERIC_COLS = ["shares", "price", "amount", "fee", "tax", "original_amount", "fx_rate"]


def col_letter(n):
    return chr(64 + n)


def connect():
    creds_json = os.environ["GOOGLE_CREDENTIALS_JSON"]
    info = json.loads(creds_json)
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    gc = gspread.authorize(creds)
    return gc.open_by_key(os.environ["SPREADSHEET_ID"])


def load_csv():
    df = pd.read_csv(CSV_PATH, dtype=str)
    df = df.fillna("")
    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def push_traderepublic(ss, df):
    ws = ss.worksheet(SHEET_TRADEREPUBLIC)
    ws.clear()

    values = [HEADER]
    for _, row in df.iterrows():
        r = []
        for col in HEADER:
            v = row.get(col, "")
            if col in NUMERIC_COLS:
                r.append(v if pd.notna(v) else "")
            else:
                r.append(str(v) if v != "" else "")
        values.append(r)

    # value_input_option="RAW": i numeri vengono scritti come numeri veri,
    # senza passare dal parser testuale/locale del foglio. Questo evita
    # il bug che moltiplicava shares/price/amount per 1000.
    ws.update(values, value_input_option="RAW")
    print(f"TradeRepublic: {len(values) - 1} righe scritte (replace completo)")


def sync_portfolio(ss, df):
    ws = ss.worksheet(SHEET_PORTFOLIO)
    trading = df[df["type"].isin(["BUY", "SELL"])]
    instruments = trading.drop_duplicates("name")[["name", "asset_class"]]

    col_values = ws.col_values(1)  # colonna A: Strumento
    existing_names = set(v for v in col_values[2:] if v)  # dalla riga 3

    last_row = 2
    for i, v in enumerate(col_values[2:], start=3):
        if v:
            last_row = i
    next_row = last_row + 1

    name_col = col_letter(HEADER.index("name") + 1)
    shares_col = col_letter(HEADER.index("shares") + 1)
    amount_col = col_letter(HEADER.index("amount") + 1)
    fee_col = col_letter(HEADER.index("fee") + 1)
    T = SHEET_TRADEREPUBLIC

    updates = []
    aggiunti = 0
    for _, row in instruments.iterrows():
        nome = row["name"]
        if not nome or nome in existing_names:
            continue
        tipo = "AZIONI" if row["asset_class"] == "STOCK" else "ETF"
        r = next_row

        updates.append({"range": f"A{r}", "values": [[nome]]})
        updates.append({"range": f"B{r}", "values": [[tipo]]})
        updates.append({"range": f"C{r}", "values": [[
            f"=CONTA.SE({T}!${name_col}:${name_col};A{r})"]]})
        updates.append({"range": f"D{r}", "values": [[
            f"=SOMMA.SE({T}!${name_col}:${name_col};A{r};{T}!${shares_col}:${shares_col})"]]})
        updates.append({"range": f"E{r}", "values": [[
            f"=-SOMMA.SE({T}!${name_col}:${name_col};A{r};{T}!${amount_col}:${amount_col})"
            f"-SOMMA.SE({T}!${name_col}:${name_col};A{r};{T}!${fee_col}:${fee_col})"]]})
        updates.append({"range": f"F{r}", "values": [[
            f"=-SOMMA.SE({T}!${name_col}:${name_col};A{r};{T}!${fee_col}:${fee_col})"]]})
        updates.append({"range": f"G{r}", "values": [[f"=SE(D{r}=0;\"\";E{r}/D{r})"]]})
        updates.append({"range": f"H{r}", "values": [[f"=SE($E$2=0;0;E{r}/$E$2)"]]})

        existing_names.add(nome)
        next_row += 1
        aggiunti += 1

    if updates:
        ws.batch_update(updates, value_input_option="USER_ENTERED")
    ws.update_acell("E2", "=SOMMA(E3:E9999)")
    print(f"Portfolio_Summary: {aggiunti} nuovi strumenti aggiunti")


def main():
    ss = connect()
    df = load_csv()
    push_traderepublic(ss, df)
    sync_portfolio(ss, df)


if __name__ == "__main__":
    main()
