# Live wind stations in Italy: survey of free sources

Survey of 2026-10-29, for choosing which station sources to add after METAR and ARPAV.
"Verified" means I called the real endpoint and read current data; otherwise the finding comes
from documentation or search results and needs checking before any work.

## Already in the app

Meteotrentino and ARPA Lombardia were added after this survey (see their rows below, now in the app).

| Source | Coverage | Format | Licence | Every | Gusts | History | Notes |
|---|---|---|---|---|---|---|---|
| **METAR** (NOAA Aviation Weather Center) | Airports, all Italy | JSON API, no key | Public domain | 30 min | When significant | 7 days | Verified. Excellent for spots next to an airport (see below) |
| **ARPAV** (Veneto) | ~190 stations, Veneto | XML per station, no key | CC BY 4.0 | 30 min | No | ~2 days | Verified. Solves Sottomarina (4 usable stations) |
| **Windy open-data** | Scattered, personal stations | JSON API, free key | Owners' open licence | ~5-10 min | Often | 7 days | Verified. Many stations offline; some are stale copies of ARPAV stations |
| **Meteotrentino** | 113 active stations, Trentino | XML, no key | CC BY 4.0 | 15 min | Yes | ~1.5 days | Verified. Torbole (Lake Garda) usable; most other stations have no anemometer |
| **ARPA Lombardia** | 132 wind stations, Lombardy | Socrata JSON | CC0 | 10 min | Max value (operator 3) when present | Current month | Verified, but anonymous requests get HTTP 429 quickly: needs the free app token |
| **MeteoNetwork** | Amateur network, all Italy | JSON API, free token | CC BY 4.0 | ~5-10 min | Often | None (free token) | Waiting for the token; no search by position |

### METAR next to kite spots (verified, reporting now)

| Airport | ICAO | Kite spot nearby |
|---|---|---|
| Lamezia Terme | LICA | Gizzeria / Hang Loose Beach, ~4 km |
| Trapani-Birgi | LICT | Lo Stagnone (Marsala), ~4 km |
| Olbia | LIEO | Golfo Aranci, Olbia coast; Porto Pollo is ~40 km |
| Cagliari-Elmas | LIEE | Poetto, Giorgino |
| Alghero | LIEA | Alghero coast |
| Lecce-Galatina | LIBN | Salento (inland, ~20 km from both coasts) |
| Bari | LIBD | Bari coast |
| Rome-Fiumicino | LIRF | Fiumicino, Ostia |
| Pisa | LIRP | Tirrenia, Marina di Pisa |
| Ancona-Falconara | LIPY | Falconara, Senigallia |
| Naples | LIRN | Gulf of Naples |
| Trieste | LIPQ | Gulf of Trieste (inland airport) |
| Venice-Tessera | LIPZ | Venice lagoon (33 km from Sottomarina) |

The military stations at Capo Frasca (LIEB), Capo Carbonara (LIEC) and Tortolì (LIET) did not
report through NOAA when checked.

## Candidates

| Region | Source | Verified | Format | Licence | Every | Gusts | History | Kite areas covered | Effort |
|---|---|---|---|---|---|---|---|---|---|
| **Lombardy** | ARPA Lombardia via Open Data Lombardia (Socrata) | **Yes** | JSON API (Socrata): sensors registry `nf78-nj6b` with coordinates, data `647i-nhxk` (current month); app token optional | **CC0** (dataset metadata) | 10 min | No (speed and direction only) | Current month | 132 wind stations. **Lake Como**: Colico 3 km, Lecco 1.7 km; **Garda west**: Gargnano 3.4 km; **Iseo**: Tavernola 3.3 km | Low: clean API, search by position from the registry. Times in local (solar?) time, to confirm |
| **Trentino** | Meteotrentino (`dati.meteotrentino.it/service.asmx`) | **Yes** | XML: `listaStazioni`, `ultimiDatiStazione?codice=` | **CC BY 4.0** (dati.trentino.it) | 15 min | **Yes** (`vmax`) | ~1.5 days | **Torbole (Belvedere) T0193**: Lake Garda north shore, the main kite area. 113 active stations | Low: one XML per station like ARPAV. Times local (solar or legal: confirm in summer) |
| **Emilia-Romagna** | ARPAE-SIMC real-time file | **Yes** | One JSON-lines file for the whole region (`realtime.jsonl`, ~9 MB), meteorological codes (BUFR B-table) | CC BY 4.0 (per an ARPAE decision found in search; the catalogue page has moved, recheck) | 15 min | **Yes** | ~6 hours | 51 wind stations: **Porto Garibaldi** (sea network), Cattolica, Riccione, Rimini, Ravenna, Comacchio area | Medium: the 9 MB file must be read and cached (e.g. every 15 min) to serve all stations; ~6 h of history is too short for Days, so the app would need to keep readings itself (as for MeteoNetwork) |
| **Calabria** | ARPACAL Centro Funzionale (cfd.calabria.it) | No | Public real-time pages without login (last ~15 days, not validated) per an ARPACAL note; machine-readable format unknown | Unknown | ? | ? | ~15 days | Gizzeria is already covered by METAR LICA | Unknown: needs a look at the site |
| **Piemonte** | ARPA Piemonte webgis, ArcGIS service `TR_vento` | No | ArcGIS REST map service (real-time wind layer, found in search) | Unknown | ? | ? | ? | Lake Maggiore (Piedmont shore), Lake Orta: minor kite areas | Unknown |
| **South Tyrol** | Open Data Hub (`mobility.api.opendatahub.com`) | **Yes, not usable** | JSON API | CC0 (hub) | – | – | – | Lake Resia/Reschen: the stations nearby only have readings up to 2022–2023 in the hub; the province's old endpoint has moved | Would need the province's current API, not found |

## Not available as open real-time data

| Region | Source | Finding |
|---|---|---|
| Puglia | ARPA Puglia API (`cloud.arpa.puglia.it/Meteo`) | Validated **daily** summaries by year, few stations: not real-time. METAR covers Lecce and Bari |
| Sardinia | ARPAS (186 stations) | No public API or open real-time feed found. METAR covers Olbia, Cagliari, Alghero |
| Sicily | SIAS (96 stations) | Data only for accredited users. METAR covers Trapani (Lo Stagnone), Palermo, Catania |
| Friuli Venezia Giulia | ARPA FVG OSMER | No documented API; licence reported as CC BY-SA 3.0 IT (share-alike). METAR covers Trieste |
| Liguria | ARPAL OMIRL | No open station API found (radar and maps only) |
| Tuscany | SIR / CFR Toscana | No open real-time download found (2012 note: real-time was password-protected) |
| Lazio, Campania, Marche, Abruzzo, Molise, Basilicata | Regional agencies | Not surveyed in depth; nothing found in a first search. METAR covers Rome, Naples, Ancona |
| Venice lagoon | Centro Maree (Comune di Venezia), ISPRA RMLV | No licence or machine-readable feed; anti-bot wall; ISPRA real-time only as images |

## Recommendation

1. **Meteotrentino** first: Torbole is Lake Garda's main kite area, with gusts, CC BY 4.0, a
   small XML adapter much like ARPAV.
2. **ARPA Lombardia**: CC0, a clean API, and stations right on Lake Como and Garda's west shore.
   No gusts.
3. **ARPAE Emilia-Romagna** only if the Romagna coast matters: good data with gusts, but a 9 MB
   file and only ~6 hours of history mean more work (a shared cache and our own recording).
4. Skip the rest for now: METAR already covers the big southern and island spots (Gizzeria,
   Lo Stagnone, Sardinia's airports), and the other regions publish no open real-time feed.

Each new source is one adapter implementing `StationAdapter` (`server/src/sources/types.ts`),
its name in the source lists, and its credit on `/about`.
