import sys
import re
import json
from pypdf import PdfReader

MONTH_EN_TO_NUM = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
}

MONTH_TH_TO_NUM = {
    "มกราคม": 1, "กุมภาพันธ์": 2, "มีนาคม": 3, "เมษายน": 4, "พฤษภาคม": 5, "มิถุนายน": 6,
    "กรกฎาคม": 7, "สิงหาคม": 8, "กันยายน": 9, "ตุลาคม": 10, "พฤศจิกายน": 11, "ธันวาคม": 12
}

MONTH_NUM_TO_TH = {v: k for k, v in MONTH_TH_TO_NUM.items()}

def parse_pdf(pdf_path):
    try:
        reader = PdfReader(pdf_path)
        full_text_by_page = []
        for page in reader.pages:
            full_text_by_page.append(page.extract_text() or "")
        if len(full_text_by_page) < 6:
            return {"success": False, "error": "FM-HY PDF must contain at least 6 pages"}
            
        full_text = "\n".join(full_text_by_page)
        
        # 1. Detect Month and Year from text
        # Look for English pattern e.g., "May 2026" or "May  2026"
        month_num = None
        year = None
        
        match_en = re.search(
            r"\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\s*(\d{4})", 
            full_text, 
            re.IGNORECASE
        )
        if match_en:
            month_name = match_en.group(1).lower()
            month_num = MONTH_EN_TO_NUM.get(month_name)
            year = int(match_en.group(2))
        else:
            # Fallback to Thai month pattern e.g. "พฤษภาคม 69" or "พฤษภาคม 2569"
            match_th = re.search(
                r"\b(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\b\s*(\d{2,4})",
                full_text
            )
            if match_th:
                month_name = match_th.group(1)
                month_num = MONTH_TH_TO_NUM.get(month_name)
                yr_val = int(match_th.group(2))
                if yr_val < 100: # BE short year e.g. 69
                    year = yr_val + 2500 - 543
                elif yr_val > 2500: # BE full year e.g. 2569
                    year = yr_val - 543
                else:
                    year = yr_val
                    
        if not month_num or not year:
            return {"success": False, "error": "Cannot determine report month and year"}
            
        target_month_th = MONTH_NUM_TO_TH[month_num]
        
        # Build month identifier e.g. "2026-05"
        month_str = f"{year}-{month_num:02d}"
        
        # Prepare targets
        th_month_pattern = rf"{target_month_th}\s*(?:69|2569|\d{{2,4}})"
        
        # 2. Extract Tissue values (Page 1)
        # Looking for line like: "พฤษภาคม 69 1238 33 29"
        tissue_data = {"roll": 0, "hand": 0, "popup": 0}
        tissue_match = re.search(rf"{th_month_pattern}\s+(\d+)\s+(\d+)\s+(\d+)", full_text_by_page[0])
        if tissue_match:
            tissue_data["roll"] = int(tissue_match.group(1))
            tissue_data["hand"] = int(tissue_match.group(2))
            tissue_data["popup"] = int(tissue_match.group(3))
            
        # 3. Extract Waste values (Page 3)
        # Looking for line like: "พฤษภาคม 69 37,200 37.20 3,425.54 3.43 83,700 83.70 124,325.54 124.33"
        waste_data = {"wet_waste": 0.0, "recycle_weight": 0.0, "rdf": 0.0}
        clean_p3 = full_text_by_page[2].replace(",", "")
        waste_match = re.search(
            rf"{target_month_th}\s*(?:69|2569|\d{{2,4}})\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?", 
            clean_p3
        )
        if waste_match:
            waste_data["wet_waste"] = float(waste_match.group(1))
            waste_data["recycle_weight"] = float(waste_match.group(2))
            waste_data["rdf"] = float(waste_match.group(3))
            
        # 4. Extract Animal Feed values (Page 3)
        # Looking for line like: "พฤษภาคม 69 37,200 141.6"
        animal_feed = {"pig_feed": 0.0, "dog_food": 0.0}
        parts = clean_p3.split("เปรียบเทียบปริมาณอาหารสัตว์")
        if len(parts) > 1:
            feed_text = parts[1]
            feed_match = re.search(
                rf"{target_month_th}\s*(?:69|2569|\d{{2,4}})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)",
                feed_text
            )
            if feed_match:
                animal_feed["pig_feed"] = float(feed_match.group(1))
                animal_feed["dog_food"] = float(feed_match.group(2))
            
        # 5. Extract Recycle Revenue (Page 5)
        # Looking for the row: "11,096.10 5,076.60 15,472.84 13,134.50 13,125.22"
        # Since the months are sorted: JAN FEB March April May
        recycle_revenue = 0.0
        p5_text = full_text_by_page[4].replace(",", "")
        rev_matches = re.findall(r"\b\d+\.\d{2}\b", p5_text)
        if len(rev_matches) >= month_num:
            recycle_revenue = float(rev_matches[month_num - 1])
            
        # 6. Extract Garbage Bags (Page 6)
        # Looking for line like: "พฤษภาคม 69 86 112 16"
        garbage_bags = {"small": 0, "medium": 0, "large": 0}
        bags_match = re.search(rf"{th_month_pattern}\s+(\d+)\s+(\d+)\s+(\d+)", full_text_by_page[5])
        if bags_match:
            garbage_bags["small"] = int(bags_match.group(1))
            garbage_bags["medium"] = int(bags_match.group(2))
            garbage_bags["large"] = int(bags_match.group(3))

        missing_sections = []
        if not tissue_match:
            missing_sections.append("tissue")
        if not waste_match:
            missing_sections.append("waste")
        if len(parts) <= 1 or not feed_match:
            missing_sections.append("animal_feed")
        if len(rev_matches) < month_num:
            missing_sections.append("recycle_revenue")
        if not bags_match:
            missing_sections.append("garbage_bags")
        if missing_sections:
            return {"success": False, "error": "Missing FM-HY sections: " + ", ".join(missing_sections)}
            
        # Compile result
        res = {
            "success": True,
            "month": month_str,
            "thai_month": target_month_th,
            "year_be": year + 543,
            "data": {
                "tissue": tissue_data,
                "waste": waste_data,
                "animal_feed": animal_feed,
                "recycle_revenue": recycle_revenue,
                "garbage_bags": garbage_bags
            }
        }
        return res
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No file path provided"}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    result = parse_pdf(pdf_path)
    print(json.dumps(result, ensure_ascii=True))
