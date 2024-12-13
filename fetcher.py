import os
import json
import logging
from time import sleep

import requests
import typer


# Define paths for saving files
RAW_DATA_DIR = "./raw_data"
XKCD_DIR = os.path.join(RAW_DATA_DIR, "xkcd")
EXPLAIN_DIR = os.path.join(RAW_DATA_DIR, "explainxkcd")
os.makedirs(XKCD_DIR, exist_ok=True)
os.makedirs(EXPLAIN_DIR, exist_ok=True)

# Base URLs
XKCD_CURRENT_URL = "https://xkcd.com/info.0.json"
XKCD_SPECIFIC_URL = "https://xkcd.com/{comic_num}/info.0.json"
EXPLAINXKCD_API_URL = "https://www.explainxkcd.com/wiki/api.php"

MAX_FAILURES = 3 # Max number of consecutive failures allowed before aborting

# Configure logging
LOG_LEVEL = logging.INFO  # Default log level, can be changed to DEBUG for more detailed output
logging.basicConfig(level=LOG_LEVEL, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


app = typer.Typer()


def fetch_xkcd_data(comic_num=None):
    url = XKCD_CURRENT_URL if comic_num is None else XKCD_SPECIFIC_URL.format(comic_num=comic_num)
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Error fetching xkcd data for comic {comic_num if comic_num else 'current'}: {e}")
        return None


def fetch_explainxkcd_data(comic_num, title):
    params = {
        "action": "parse",
        "page": f"{comic_num}:_{title.replace(' ', '_')}",
        "prop": "wikitext",
        "sectiontitle": "Explanation",
        "format": "json"
    }
    try:
        response = requests.get(EXPLAINXKCD_API_URL, params=params, timeout=5)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Error fetching explainxkcd data for comic {comic_num}: {e}")
        return None


def save_comic_data(comic_num, xkcd_data=None, explain_data=None):
    if xkcd_data is not None:
        xkcd_file_path = os.path.join(XKCD_DIR, f"{comic_num}.json")
        if not os.path.exists(xkcd_file_path):
            with open(xkcd_file_path, "w") as f:
                json.dump(xkcd_data, f, separators=(',', ':'))

    if explain_data is not None:
        explain_file_path = os.path.join(EXPLAIN_DIR, f"{comic_num}.json")
        if not os.path.exists(explain_file_path):
            with open(explain_file_path, "w") as f:
                json.dump(explain_data, f, separators=(',', ':'))


def fetch_and_store_comic_data(comic_num, fetch_xkcd=True, fetch_explain=True):
    xkcd_file_path = os.path.join(XKCD_DIR, f"{comic_num}.json")
    explain_file_path = os.path.join(EXPLAIN_DIR, f"{comic_num}.json")

    if fetch_xkcd and os.path.exists(xkcd_file_path):
        fetch_xkcd = False
    if fetch_explain and os.path.exists(explain_file_path):
        fetch_explain = False

    if not fetch_xkcd and not fetch_explain:
        print("--", end=" ", flush=True)  # Indicate skipped comic
        return (True, False)

    xkcd_data = None
    explain_data = None
    success = True
    did_fetch = fetch_xkcd or fetch_explain

    if fetch_xkcd:
        xkcd_data = fetch_xkcd_data(comic_num)
        if not xkcd_data:
            success = False
            print("\u2717", end="", flush=True)  # Indicate failure
        else:
            save_comic_data(comic_num, xkcd_data=xkcd_data)
            print("\u2713", end="", flush=True)  # Indicate success
    else:
        print("-", end="", flush=True)

    if fetch_explain:
        if xkcd_data or os.path.exists(xkcd_file_path):
            if not xkcd_data and os.path.exists(xkcd_file_path):
                with open(xkcd_file_path, "r") as f:
                    xkcd_data = json.load(f)
            title = xkcd_data.get("safe_title", "") if xkcd_data else ""
            explain_data = fetch_explainxkcd_data(comic_num, title)
            if explain_data:
                save_comic_data(comic_num, explain_data=explain_data)
                print("\u2713", end="", flush=True)  # Indicate success
            else:
                success = False
                print("\u2717", end="", flush=True)  # Indicate failure
        else:
            print("-", end="", flush=True)
    else:
        print("-", end="", flush=True)

    print(" ", end="", flush=True)  # Add space for next indicator

    return (success, did_fetch)


def fetch_all_comics(total_comics, fetch_xkcd=True, fetch_explain=True):
    failure_count = 0
    for comic_num in range(1, total_comics + 1):
        (success, did_fetch) = fetch_and_store_comic_data(comic_num, fetch_xkcd, fetch_explain)
        if success:
            failure_count = 0
            if did_fetch:
                sleep(1)
        else:
            failure_count += 1
            if failure_count >= MAX_FAILURES:
                logger.error(f"Too many consecutive failures ({MAX_FAILURES}). Aborting further fetches.")
                break


def fetch_range_comics(start, end, fetch_xkcd=True, fetch_explain=True):
    failure_count = 0
    for comic_num in range(start, end + 1):
        (success, did_fetch) = fetch_and_store_comic_data(comic_num, fetch_xkcd, fetch_explain)
        if success:
            failure_count = 0
            if did_fetch:
                sleep(1)
        else:
            failure_count += 1
            if failure_count >= MAX_FAILURES:
                logger.error(f"Too many consecutive failures ({MAX_FAILURES}). Aborting further fetches.")
                break


def fetch_recent_comic(fetch_xkcd=True, fetch_explain=True):
    logger.info("Fetching the most recent comic...")
    xkcd_data = fetch_xkcd_data()
    if not xkcd_data:
        return
    comic_num = xkcd_data.get("num")
    fetch_and_store_comic_data(comic_num, fetch_xkcd, fetch_explain)


@app.command()
def main():
    try:
        mode = input("Enter 'all' to fetch all comics, 'recent' to fetch the most recent comic (default), or a specific comic number or range (e.g., 123, 123-456, *-1000, 1000-*): ").strip().lower()
        fetch_xkcd = input("Fetch xkcd data? (yes/no, default is yes): ").strip().lower() != 'no'
        fetch_explain = input("Fetch explain data? (yes/no, default is yes): ").strip().lower() != 'no'

        if mode == 'all':
            recent_comic_data = fetch_xkcd_data()
            if recent_comic_data:
                total_comics = recent_comic_data.get("num", 3015)
                fetch_all_comics(total_comics, fetch_xkcd, fetch_explain)
        elif mode == 'recent' or mode == '':
            fetch_recent_comic(fetch_xkcd, fetch_explain)
        elif '-' in mode:
            try:
                if mode.startswith('*-'):
                    end = int(mode.split('-')[1])
                    fetch_range_comics(1, end, fetch_xkcd, fetch_explain)
                elif mode.endswith('-*'):
                    start = int(mode.split('-')[0])
                    recent_comic_data = fetch_xkcd_data()
                    end = recent_comic_data.get("num", 3015) if recent_comic_data else 3015
                    fetch_range_comics(start, end, fetch_xkcd, fetch_explain)
                else:
                    start, end = map(int, mode.split('-'))
                    fetch_range_comics(start, end, fetch_xkcd, fetch_explain)
            except ValueError:
                logger.error("Invalid range input. Please enter a valid range like 123-456 or *-1000.")
        else:
            try:
                comic_num = int(mode)
                fetch_and_store_comic_data(comic_num, fetch_xkcd, fetch_explain)
            except ValueError:
                logger.error("Invalid input. Please enter 'all', 'recent', a valid comic number, or a valid range.")
    except KeyboardInterrupt:
        logger.warning("\nProcess interrupted by user. Exiting gracefully.")


if __name__ == "__main__":
    main()
