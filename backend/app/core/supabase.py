from supabase import create_client, Client
from app.core.config import settings

# Service role client — bypasses RLS, only used server-side in FastAPI.
# Never expose this client or its key to the frontend.
supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)
