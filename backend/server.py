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

# ---------- Env ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "43200"))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# ---------- DB ----------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

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

class PairJoinIn(BaseModel):
    code: str

class GestureIn(BaseModel):
    type: str  # kiss | heart | miss
    message: Optional[str] = None

class WardrobeIn(BaseModel):
    imageBase64: str  # raw base64 (no data uri prefix)
    prompt: str

# ---------- Auth ----------
@api_router.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "name": body.name or email.split("@")[0],
        "passwordHash": hash_password(body.password),
        "avatarEmoji": "💗",
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

# ---------- Wardrobe (AI) ----------
@api_router.post("/wardrobe/generate")
async def wardrobe_generate(body: WardrobeIn, user=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI key not configured")
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(400, "Prompt required")

    # Clean base64 (in case a data URI slipped in)
    src_b64 = body.imageBase64
    if "," in src_b64 and src_b64.startswith("data:"):
        src_b64 = src_b64.split(",", 1)[1]
    try:
        base64.b64decode(src_b64[:64])
    except Exception:
        raise HTTPException(400, "Invalid image data")

    # Call Gemini Nano Banana via emergentintegrations
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    session_id = f"wardrobe-{user['id']}-{uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message="You are a fashion AI. Edit the given photo of a person, keeping their face, pose and identity intact, and change only their outfit as described.",
    )
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])

    edit_prompt = (
        f"Change the outfit of the person in this photo to: {prompt}. "
        "Preserve the person's face, hair, skin tone, pose, and background. "
        "Only change the clothing. Photorealistic result."
    )
    msg = UserMessage(text=edit_prompt, file_contents=[ImageContent(src_b64)])

    try:
        text_out, images = await asyncio.wait_for(
            chat.send_message_multimodal_response(msg), timeout=120
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI generation timed out")
    except Exception as e:
        logger.exception("Wardrobe AI error")
        raise HTTPException(502, f"AI generation failed: {str(e)[:120]}")

    if not images:
        raise HTTPException(502, "AI did not return an image")

    out_b64 = images[0]["data"]
    mime = images[0].get("mime_type", "image/png")

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
