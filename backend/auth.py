import os
import json
import jwt
import requests
from functools import wraps
from flask import request, jsonify, g
from cryptography.x509 import load_pem_x509_certificate
from cryptography.hazmat.backends import default_backend
import db

# Cache for MSAL public keys
JWKS_CACHE = {}

def get_msal_public_keys():
    """Fetches Microsoft public keys for JWT signature verification."""
    global JWKS_CACHE
    tenant_id = os.environ.get('ENTRA_TENANT_ID', 'common')
    
    if JWKS_CACHE:
        return JWKS_CACHE
        
    jwks_url = f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
    try:
        response = requests.get(jwks_url)
        response.raise_for_status()
        JWKS_CACHE = response.json()
        return JWKS_CACHE
    except requests.RequestException as e:
        print(f"[Auth Error] Failed to fetch JWKS keys: {e}")
        return {}

def get_user_roles_from_db(email):
    if not email:
        return []
    conn = db.get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT roles FROM cri_cra_dev.crm.user_roles WHERE email = ?", (email,))
            row = cursor.fetchone()
            if row and row.roles:
                return json.loads(row.roles)
            return []
    except Exception as e:
        print(f"[Auth Error] DB role fetch failed: {e}")
        return []
    finally:
        if conn: conn.close()

def check_global_auth():
    """
    Function to be used in Flask `before_request` to protect all /api/ routes.
    """
    if request.method == 'OPTIONS':
        return None
        
    if not request.path.startswith('/api/'):
        return None
        
    if os.environ.get('ENABLE_ENTRA_ID_AUTH', 'false').lower() == 'false':
        g.user_roles = ['administrador']
        g.user_email = os.environ.get('MOCK_USER_EMAIL', 'admin@mock.local')
        return None

    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Missing or invalid Authorization header'}), 401
                
    token = auth_header.split(' ')[1]
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get('kid')
                
        jwks = get_msal_public_keys()
        keys = jwks.get('keys', [])
                
        rsa_key = None
        for key in keys:
            if key['kid'] == kid:
                x5c = key.get('x5c', [])
                if x5c:
                    cert_str = f"-----BEGIN CERTIFICATE-----\n{x5c[0]}\n-----END CERTIFICATE-----\n"
                    cert_obj = load_pem_x509_certificate(cert_str.encode(), default_backend())
                    rsa_key = cert_obj.public_key()
                break
                
        if rsa_key is None:
            return jsonify({'error': 'Public key not found in JWKS'}), 401
                
        client_id = os.environ.get('ENTRA_CLIENT_ID')
                
        decoded_token = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=client_id,
            options={"verify_iss": False}
        )
                
        email = decoded_token.get('preferred_username') or decoded_token.get('email')
        if not email:
            return jsonify({'error': 'Token does not contain an email assertion'}), 401
            
        email = email.lower()
        super_admin = os.environ.get('SUPER_ADMIN_EMAIL', '').lower()
        
        if super_admin and email == super_admin:
            user_roles = ['administrador']
        else:
            db_roles = get_user_roles_from_db(email)
            user_roles = db_roles if db_roles else ['comum']
                
        g.user_token = decoded_token
        g.user_email = email
        g.user_roles = user_roles
        return None

    except jwt.ExpiredSignatureError:
        return jsonify({'error': 'Token has expired'}), 401
    except jwt.InvalidTokenError as e:
        return jsonify({'error': f'Invalid token: {str(e)}'}), 401
    except Exception as e:
        return jsonify({'error': f'Authentication error: {str(e)}'}), 500

def require_auth(allowed_roles=None):
    """
    Decorator to protect Flask routes with Entra ID Bearer Token validation.
    If allowed_roles is provided, the token must contain at least one of those roles.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # If Entra ID enforcement is turned off locally (for dev/tests), skip validation
            if os.environ.get('ENABLE_ENTRA_ID_AUTH', 'false').lower() == 'false':
                g.user_roles = ['administrador']
                return f(*args, **kwargs)

            auth_header = request.headers.get('Authorization')
            
            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({'error': 'Missing or invalid Authorization header'}), 401
                
            token = auth_header.split(' ')[1]
            try:
                unverified_header = jwt.get_unverified_header(token)
                kid = unverified_header.get('kid')
                
                # Fetch keys
                jwks = get_msal_public_keys()
                keys = jwks.get('keys', [])
                
                rsa_key = None
                for key in keys:
                    if key['kid'] == kid:
                        # Extract the x5c certificate string and format it as PEM
                        x5c = key.get('x5c', [])
                        if x5c:
                            cert_str = f"-----BEGIN CERTIFICATE-----\n{x5c[0]}\n-----END CERTIFICATE-----\n"
                            cert_obj = load_pem_x509_certificate(cert_str.encode(), default_backend())
                            rsa_key = cert_obj.public_key()
                        break
                
                if rsa_key is None:
                    return jsonify({'error': 'Public key not found in JWKS'}), 401
                
                # Verify token signature and claims
                client_id = os.environ.get('ENTRA_CLIENT_ID')
                
                # Check token
                # For SPA idTokens the audience is exactly the client_id
                decoded_token = jwt.decode(
                    token,
                    rsa_key,
                    algorithms=["RS256"],
                    audience=client_id,
                    options={"verify_iss": False}
                )
                
                email = decoded_token.get('preferred_username') or decoded_token.get('email')
                if not email:
                    return jsonify({'error': 'Token does not contain an email assertion'}), 401
                    
                email = email.lower()
                super_admin = os.environ.get('SUPER_ADMIN_EMAIL', '').lower()
                
                if super_admin and email == super_admin:
                    user_roles = ['administrador']
                else:
                    db_roles = get_user_roles_from_db(email)
                    user_roles = db_roles if db_roles else ['comum']
                
                g.user_token = decoded_token
                g.user_email = email
                g.user_roles = user_roles
                
                # Check Roles
                if allowed_roles:
                    user_roles = set(g.user_roles)
                    required_roles = set(allowed_roles)
                    
                    if 'administrador' not in user_roles and not (user_roles & required_roles):
                        return jsonify({'error': 'Forbidden: Insufficient roles'}), 403
                        
                return f(*args, **kwargs)

            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'Token has expired'}), 401
            except jwt.InvalidTokenError as e:
                return jsonify({'error': f'Invalid token: {str(e)}'}), 401
            except Exception as e:
                return jsonify({'error': f'Authentication error: {str(e)}'}), 500
                
        return decorated_function
    return decorator
