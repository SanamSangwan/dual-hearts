from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import uuid
import secrets
import logging
import bcrypt
import jwt
import base64
import asyncio
import resend
from google import genai
from google.genai import types

# ---------- Env ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "43200"))
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
resend.api_key = RESEND_API_KEY

# ---------- DB ----------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# ---------- App ----------
app = FastAPI(title="OurSpace API")
api_router = APIRouter(prefix="/api")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------- Utils ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str) -> str:
    exp = now_utc() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": exp}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def user_public(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name") or user["email"].split("@")[0],
        "avatarEmoji": user.get("avatarEmoji", "💗"),
        "coupleId": user.get("coupleId"),
    }

async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    accountType: str = "couple"  # "single" or "couple"

class PairJoinIn(BaseModel):
    code: str

class GestureIn(BaseModel):
    type: str  # kiss | heart | miss
    message: Optional[str] = None

class WardrobeIn(BaseModel):
    imageBase64: str  # raw base64 (no data uri prefix)
    prompt: str

# ---------- OTP Email Verification ----------
import random

class OtpRequestIn(BaseModel):
    email: EmailStr

class OtpVerifyIn(BaseModel):
    email: EmailStr
    code: str

def send_otp_email(to_email: str, code: str):
    resend.Emails.send({
        "from": "OurSpace <onboarding@resend.dev>",
        "to": [to_email],
        "subject": "Your OurSpace verification code",
        "text": f"Your OurSpace verification code is: {code}\n\nThis code expires in 10 minutes.",
    })

@api_router.post("/auth/send-otp")
async def send_otp(body: OtpRequestIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    code = f"{random.randint(0, 999999):06d}"
    await db.otps.update_one(
        {"email": email},
        {"$set": {
            "code": code,
            "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "verified": False,
            "createdAt": now_utc().isoformat(),
        }},
        upsert=True,
    )
    try:
        send_otp_email(email, code)
    except Exception as e:
        logger.exception("OTP email send failed")
        raise HTTPException(502, f"Failed to send verification email: {str(e)[:120]}")
    return {"ok": True}

@api_router.post("/auth/verify-otp")
async def verify_otp(body: OtpVerifyIn):
    email = body.email.lower()
    dev_bypass_code = os.environ.get("DEV_OTP_BYPASS_CODE")
    if dev_bypass_code and body.code == dev_bypass_code:
        await db.otps.update_one(
            {"email": email},
            {"$set": {"verified": True, "code": dev_bypass_code, "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()}},
            upsert=True,
        )
        return {"ok": True}
    record = await db.otps.find_one({"email": email})
    if not record:
        raise HTTPException(400, "No verification code found, request a new one")
    expires_at = datetime.fromisoformat(record["expiresAt"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(400, "Code expired, request a new one")
    if record["code"] != body.code:
        raise HTTPException(400, "Incorrect code")
    await db.otps.update_one({"email": email}, {"$set": {"verified": True}})
    return {"ok": True}

# ---------- Auth ----------
@api_router.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    if body.accountType not in ("single", "couple"):
        raise HTTPException(400, "accountType must be 'single' or 'couple'")
    otp_record = await db.otps.find_one({"email": email})
    if not otp_record or not otp_record.get("verified"):
        raise HTTPException(400, "Please verify your email with the code sent before registering")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "name": body.name or email.split("@")[0],
        "passwordHash": hash_password(body.password),
        "avatarEmoji": "💗",
        "accountType": body.accountType,
        "coupleId": None,
        "createdAt": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id)
    return {"access_token": token, "token_type": "bearer", "user": user_public(doc)}

@api_router.post("/auth/login")
async def login(form: OAuth2PasswordRequestForm = Depends()):
    email = form.username.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    dummy = bcrypt.hashpw(b"dummy", bcrypt.gensalt()).decode()
    if not user:
        bcrypt.checkpw(form.password.encode(), dummy.encode())
        raise HTTPException(401, "Incorrect email or password")
    if not verify_password(form.password, user["passwordHash"]):
        raise HTTPException(401, "Incorrect email or password")
    token = create_access_token(user["id"])
    return {"access_token": token, "token_type": "bearer", "user": user_public(user)}

@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    partner = None
    if user.get("coupleId"):
        p = await db.users.find_one(
            {"coupleId": user["coupleId"], "id": {"$ne": user["id"]}}, {"_id": 0}
        )
        if p:
            partner = user_public(p)
    return {"user": user_public(user), "partner": partner}

# ---------- Couple pairing ----------
@api_router.post("/couple/create")
async def create_couple(user=Depends(get_current_user)):
    if user.get("coupleId"):
        raise HTTPException(400, "Already in a couple")
    code = secrets.token_urlsafe(4).replace("-", "").replace("_", "").upper()[:6]
    couple_id = str(uuid.uuid4())
    await db.couples.insert_one({
        "id": couple_id,
        "code": code,
        "members": [user["id"]],
        "createdAt": now_utc().isoformat(),
    })
    await db.users.update_one({"id": user["id"]}, {"$set": {"coupleId": couple_id}})
    return {"code": code, "coupleId": couple_id}

@api_router.post("/couple/join")
async def join_couple(body: PairJoinIn, user=Depends(get_current_user)):
    if user.get("coupleId"):
        raise HTTPException(400, "Already in a couple")
    couple = await db.couples.find_one({"code": body.code.upper()}, {"_id": 0})
    if not couple:
        raise HTTPException(404, "Invalid pair code")
    if len(couple["members"]) >= 2:
        raise HTTPException(400, "Couple already full")
    if user["id"] in couple["members"]:
        raise HTTPException(400, "You are already in this couple")
    await db.couples.update_one({"id": couple["id"]}, {"$push": {"members": user["id"]}})
    await db.users.update_one({"id": user["id"]}, {"$set": {"coupleId": couple["id"]}})
    return {"coupleId": couple["id"], "paired": True}

@api_router.post("/couple/leave")
async def leave_couple(user=Depends(get_current_user)):
    if not user.get("coupleId"):
        raise HTTPException(400, "Not in a couple")
    await db.users.update_one({"id": user["id"]}, {"$set": {"coupleId": None}})
    return {"ok": True}

# ---------- Gestures ----------
GESTURE_TYPES = {"kiss", "heart", "miss"}

class LocationIn(BaseModel):
    lat: float
    lng: float

@api_router.post("/location")
async def update_location(body: LocationIn, user=Depends(get_current_user)):
    await db.locations.update_one(
        {"userId": user["id"]},
        {"$set": {"lat": body.lat, "lng": body.lng, "updatedAt": now_utc().isoformat()}},
        upsert=True,
    )
    return {"ok": True}

@api_router.get("/location/partner")
async def get_partner_location(user=Depends(get_current_user)):
    if not user.get("coupleId"):
        raise HTTPException(400, "Not paired with a partner")
    partner = await db.users.find_one(
        {"coupleId": user["coupleId"], "id": {"$ne": user["id"]}}, {"_id": 0}
    )
    if not partner:
        raise HTTPException(404, "No partner linked")
    loc = await db.locations.find_one({"userId": partner["id"]}, {"_id": 0})
    if not loc:
        raise HTTPException(404, "Partner location not shared yet")
    return loc

@api_router.post("/gestures")
async def send_gesture(body: GestureIn, user=Depends(get_current_user)):
    if body.type not in GESTURE_TYPES:
        raise HTTPException(400, "Invalid gesture type")
    if not user.get("coupleId"):
        raise HTTPException(400, "Pair with your partner first")
    partner = await db.users.find_one(
        {"coupleId": user["coupleId"], "id": {"$ne": user["id"]}}, {"_id": 0}
    )
    doc = {
        "id": str(uuid.uuid4()),
        "coupleId": user["coupleId"],
        "senderId": user["id"],
        "senderName": user.get("name"),
        "receiverId": partner["id"] if partner else None,
        "type": body.type,
        "message": (body.message or "").strip()[:280] or None,
        "createdAt": now_utc().isoformat(),
    }
    await db.gestures.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/gestures")
async def list_gestures(user=Depends(get_current_user), limit: int = 100):
    if not user.get("coupleId"):
        return {"items": []}
    cursor = db.gestures.find({"coupleId": user["coupleId"]}, {"_id": 0}).sort("createdAt", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"items": items}

@api_router.get("/gestures/stats")
async def gesture_stats(user=Depends(get_current_user)):
    if not user.get("coupleId"):
        return {"total": 0, "byType": {"kiss": 0, "heart": 0, "miss": 0}}
    pipeline = [
        {"$match": {"coupleId": user["coupleId"]}},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
    ]
    by_type = {"kiss": 0, "heart": 0, "miss": 0}
    total = 0
    async for row in db.gestures.aggregate(pipeline):
        by_type[row["_id"]] = row["count"]
        total += row["count"]
    return {"total": total, "byType": by_type}

# ---------- Singles: Profile, Swipe, Match, Chat ----------
class SingleProfileIn(BaseModel):
    bio: str = ""
    age: int
    photos: List[str] = []  # base64 images, small count expected

class SwipeIn(BaseModel):
    targetUserId: str
    action: str  # "like" or "pass"

class MessageIn(BaseModel):
    matchId: str
    text: str

@api_router.post("/singles/profile")
async def upsert_single_profile(body: SingleProfileIn, user=Depends(get_current_user)):
    if body.age < 18:
        raise HTTPException(400, "Must be 18 or older")
    await db.single_profiles.update_one(
        {"userId": user["id"]},
        {"$set": {"bio": body.bio, "age": body.age, "photos": body.photos, "updatedAt": now_utc().isoformat()}},
        upsert=True,
    )
    return {"ok": True}

@api_router.get("/singles/discover")
async def discover_singles(user=Depends(get_current_user), limit: int = 20):
    my_loc = await db.locations.find_one({"userId": user["id"]})
    if not my_loc:
        raise HTTPException(400, "Share your location first to discover nearby singles")
    swiped_ids = [s["targetUserId"] async for s in db.swipes.find({"userId": user["id"]}, {"targetUserId": 1})]
    blocked_ids = [b["blockedId"] async for b in db.blocks.find({"userId": user["id"]}, {"blockedId": 1})]
    exclude_ids = swiped_ids + blocked_ids + [user["id"]]
    eligible_user_ids = [u["id"] async for u in db.users.find(
        {"accountType": "single", "coupleId": None, "id": {"$nin": exclude_ids}}, {"id": 1}
    )]
    profiles = await db.single_profiles.find({"userId": {"$in": eligible_user_ids}}, {"_id": 0}).limit(limit).to_list(length=limit)
    # distance-only, never raw coordinates, computed server-side and returned as km
    results = []
    for p in profiles:
        loc = await db.locations.find_one({"userId": p["userId"]})
        dist_km = None
        if loc:
            from math import radians, sin, cos, sqrt, atan2
            R = 6371
            lat1, lon1 = radians(my_loc["lat"]), radians(my_loc["lng"])
            lat2, lon2 = radians(loc["lat"]), radians(loc["lng"])
            dlat, dlon = lat2 - lat1, lon2 - lon1
            a = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlon/2)**2
            dist_km = round(R * 2 * atan2(sqrt(a), sqrt(1-a)), 1)
        results.append({**p, "distanceKm": dist_km})
    return {"profiles": results}

@api_router.post("/singles/swipe")
async def swipe(body: SwipeIn, user=Depends(get_current_user)):
    await db.swipes.insert_one({
        "id": str(uuid.uuid4()), "userId": user["id"], "targetUserId": body.targetUserId,
        "action": body.action, "createdAt": now_utc().isoformat(),
    })
    matched = False
    match_id = None
    if body.action == "like":
        reciprocal = await db.swipes.find_one({
            "userId": body.targetUserId, "targetUserId": user["id"], "action": "like"
        })
        if reciprocal:
            matched = True
            match_id = str(uuid.uuid4())
            await db.matches.insert_one({
                "id": match_id, "userIds": [user["id"], body.targetUserId],
                "createdAt": now_utc().isoformat(),
            })
    return {"matched": matched, "matchId": match_id}

@api_router.get("/singles/matches")
async def list_matches(user=Depends(get_current_user)):
    cursor = db.matches.find({"userIds": user["id"]}, {"_id": 0})
    return {"matches": await cursor.to_list(length=100)}

@api_router.post("/singles/message")
async def send_message(body: MessageIn, user=Depends(get_current_user)):
    match = await db.matches.find_one({"id": body.matchId, "userIds": user["id"]})
    if not match:
        raise HTTPException(404, "Match not found")
    await db.messages.insert_one({
        "id": str(uuid.uuid4()), "matchId": body.matchId, "senderId": user["id"],
        "text": body.text, "createdAt": now_utc().isoformat(),
    })
    return {"ok": True}

@api_router.get("/singles/messages/{match_id}")
async def get_messages(match_id: str, user=Depends(get_current_user)):
    match = await db.matches.find_one({"id": match_id, "userIds": user["id"]})
    if not match:
        raise HTTPException(404, "Match not found")
    cursor = db.messages.find({"matchId": match_id}, {"_id": 0}).sort("createdAt", 1)
    return {"messages": await cursor.to_list(length=500)}

@api_router.post("/singles/report")
async def report_user(targetUserId: str, reason: str, user=Depends(get_current_user)):
    await db.reports.insert_one({
        "id": str(uuid.uuid4()), "reporterId": user["id"], "targetUserId": targetUserId,
        "reason": reason, "createdAt": now_utc().isoformat(), "status": "pending",
    })
    return {"ok": True}

@api_router.post("/singles/block")
async def block_user(targetUserId: str, user=Depends(get_current_user)):
    await db.blocks.update_one(
        {"userId": user["id"], "blockedId": targetUserId},
        {"$set": {"createdAt": now_utc().isoformat()}}, upsert=True,
    )
    return {"ok": True}

# ---------- Wardrobe (AI) ----------
@api_router.post("/wardrobe/generate")
async def wardrobe_generate(body: WardrobeIn, user=Depends(get_current_user)):
    if not GEMINI_API_KEY:
        raise HTTPException(500, "AI key not configured")
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(400, "Prompt required")

    src_b64 = body.imageBase64
    if "," in src_b64 and src_b64.startswith("data:"):
        src_b64 = src_b64.split(",", 1)[1]
    try:
        base64.b64decode(src_b64[:64])
    except Exception:
        raise HTTPException(400, "Invalid image data")

    edit_prompt = (
        f"Change the outfit of the person in this photo to: {prompt}. "
        "Preserve the person's face, hair, skin tone, pose, and background. "
        "Only change the clothing. Photorealistic result."
    )

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                gemini_client.models.generate_content,
                model="gemini-3.1-flash-image-preview",
                contents=[
                    edit_prompt,
                    types.Part.from_bytes(data=base64.b64decode(src_b64), mime_type="image/jpeg"),
                ],
                config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
            ),
            timeout=120,
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI generation timed out")
    except Exception as e:
        logger.exception("Wardrobe AI error")
        raise HTTPException(502, f"AI generation failed: {str(e)[:120]}")

    out_b64 = None
    mime = "image/png"
    for part in response.candidates[0].content.parts:
        if part.inline_data:
            out_b64 = base64.b64encode(part.inline_data.data).decode()
            mime = part.inline_data.mime_type
            break
    if not out_b64:
        raise HTTPException(502, "AI did not return an image")

    doc = {
        "id": str(uuid.uuid4()),
        "userId": user["id"],
        "prompt": prompt,
        "imageBase64": out_b64,
        "mimeType": mime,
        "createdAt": now_utc().isoformat(),
    }
    await db.wardrobe_looks.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/wardrobe/looks")
async def list_looks(user=Depends(get_current_user), limit: int = 30):
    cursor = db.wardrobe_looks.find({"userId": user["id"]}, {"_id": 0}).sort("createdAt", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"items": items}

@api_router.delete("/wardrobe/looks/{look_id}")
async def delete_look(look_id: str, user=Depends(get_current_user)):
    res = await db.wardrobe_looks.delete_one({"id": look_id, "userId": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Look not found")
    return {"ok": True}

# ---------- Health ----------
@api_router.get("/")
async def root():
    return {"ok": True, "app": "OurSpace"}

# ---------- Mount ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
