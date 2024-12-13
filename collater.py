import os
import json
import re

import fetcher

XKCD_DIR = fetcher.XKCD_DIR
EXPLAIN_DIR = fetcher.EXPLAIN_DIR
PROCESSED_DIR = "./processed_data"

def collate(comic_num:str):
    xkcd_file_path = os.path.join(XKCD_DIR, f"{comic_num}.json")
    if not os.path.exists(xkcd_file_path):
        return None

    with open(xkcd_file_path,"r") as f:
        xkcd_data = json.load(f)

    explain_data = parse_explainxkcd(comic_num)

    return {
        "comic_num": xkcd_data.get("num"),
        "date": f"{xkcd_data.get('year',0):0>4}-{xkcd_data.get('month',0):0>2}-{xkcd_data.get('day',0):0>2}",
        "title": xkcd_data.get("safe_title"),
        "img": xkcd_data.get("img"),
        "hover": xkcd_data.get("alt"),
        "transcript": xkcd_data.get("transcript"),
        "community_transcript": explain_data.get("sections", {}).get("Transcript", ""),
    }

def collate_and_store(comic_num:str):
    collated_data = collate(comic_num)
    if collated_data is None:
        return False
    with open(os.path.join(PROCESSED_DIR, f"{comic_num}.json"), "w") as f:
        json.dump(collated_data, f)
    return True

def parse_explainxkcd(comic_num:str):
    file_path = os.path.join(EXPLAIN_DIR, f"{comic_num}.json")
    with open(file_path,"r") as f:
        data = json.load(f)

    # Initialize an empty dictionary to store the parsed data
    parsed_data = {}

    # Extract the wikitext content
    wikitext = data.get("parse", {}).get("wikitext", {}).get("*", "")

    # Extract the comic template using regex
    template_pattern = r"\{\{comic(.*?)\}\}"
    template_match = re.search(template_pattern, wikitext, re.DOTALL)

    # If a match is found, parse it into key-value pairs
    if template_match:
        template_content = template_match.group(1)
        # Find all key-value pairs in the template content
        key_value_pattern = r"\|\s*(\w+)\s*=\s*(.*?)\n"
        key_value_matches = re.findall(key_value_pattern, template_content)

        # Populate the dictionary with parsed key-value pairs
        comic_data = {}
        for key, value in key_value_matches:
            comic_data[key.strip()] = value.strip()
        
        # Add the comic data to the parsed data
        parsed_data['comic'] = comic_data

    # Extract the sections from the wikitext using regex
    section_pattern = r"==\s*(\w+)\s*==\n(.*?)(?=\n==|\Z)"
    section_matches = re.findall(section_pattern, wikitext, re.DOTALL)

    # Populate the dictionary with section names and their corresponding content
    sections_data = {}
    for section_name, section_content in section_matches:
        sections_data[section_name.strip()] = section_content.strip()
    
    # Add the sections data to the parsed data
    parsed_data['sections'] = sections_data

    return parsed_data

from pprint import pprint
# pprint(collate(1))
# pprint(collate(1000))
# pprint(collate(1024))
pprint(collate(2020))
