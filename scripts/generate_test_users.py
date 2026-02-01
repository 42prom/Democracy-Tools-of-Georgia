import random
import secrets
import hashlib
import datetime

# Configuration
NUM_USERS = 50
REGIONS = [
    'reg_tbilisi', 'reg_batumi', 'reg_kutaisi', 'reg_rustavi',
    'reg_adjara', 'reg_imereti', 'reg_kakheti', 'reg_kvemo_kartli',
    'reg_mtskheta_mtianeti', 'reg_racha_lechkhumi',
    'reg_samegrelo_zemo_svaneti', 'reg_samtskhe_javakheti', 'reg_shida_kartli'
]
GENDERS = ['M', 'F']

# HMAC Secret (In production this would be from env, but for seed data we can use a dummy or random one)
HMAC_SECRET = b'dev_secret_key_123' 

def generate_pn_hash():
    # Generate a random 11-digit "Personal Number"
    pn = ''.join([str(random.randint(0, 9)) for _ in range(11)])
    # HMAC-SHA256
    h = hashlib.new('sha256', digestmod=hashlib.sha256)
    h.update(HMAC_SECRET)
    h.update(f"GE:{pn}".encode('utf-8'))
    return h.hexdigest()

def generate_user_sql():
    sql_statements = []
    
    # Header
    sql_statements.append("-- Seed data for 50 dummy users")
    sql_statements.append("BEGIN;")
    
    for _ in range(NUM_USERS):
        pn_hash = generate_pn_hash()
        gender = random.choice(GENDERS)
        # Weight age towards 18-50, but allow up to 90
        birth_year = datetime.date.today().year - random.randint(18, 80)
        
        # Pick 1 random region for simplicity, formatted as PostgreSQL array
        region = random.choice(REGIONS)
        region_array = f"{{'{region}'}}"
        
        # Trust score between 0.0 and 1.0, weighted towards higher for "real" sounding users
        trust_score = round(random.uniform(0.7, 1.0), 2)
        
        sql = f"""
        INSERT INTO users (pn_hash, credential_gender, credential_birth_year, credential_region_codes, trust_score)
        VALUES ('{pn_hash}', '{gender}', {birth_year}, '{region_array}', {trust_score})
        ON CONFLICT (pn_hash) DO NOTHING;
        """
        sql_statements.append(sql.strip())
        
    sql_statements.append("COMMIT;")
    return "\n".join(sql_statements)

if __name__ == "__main__":
    print(generate_user_sql())
