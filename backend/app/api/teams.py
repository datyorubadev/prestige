"""Teams (P4): routing groups inside a tenant. Tickets can be assigned to a
team, and agents can scope their inbox to their team. Mutations are owner-only
(team.manage); listing is available to the whole team (team.view) so the
inbox-scope picker and ticket assignment dropdown can render teams."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import Db, get_tenant
from app.core.errors import TicketNotFound
from app.core.permissions import TEAM_MANAGE, TEAM_VIEW, require_perm
from app.models import Team, Tenant, User

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str | None = None


class TeamMemberAdd(BaseModel):
    user_id: str


def _get_team(db: Db, tenant: Tenant, team_id: str) -> Team:
    team = db.get(Team, team_id)
    if not team or team.tenant_id != tenant.id:
        raise TicketNotFound("Team not found")
    return team


def _team_dto(team: Team) -> dict:
    members = sorted(team.members, key=lambda m: m.full_name)
    return {
        "id": team.id,
        "tenantId": team.tenant_id,
        "name": team.name,
        "memberIds": [m.id for m in members],
        "members": [
            {"id": m.id, "name": m.full_name, "email": m.email, "role": m.role}
            for m in members
        ],
        "createdAt": team.created_at.isoformat() if team.created_at else None,
    }


@router.get("")
def list_teams(db: Db, tenant: Tenant = Depends(get_tenant),
               user: User = Depends(require_perm(TEAM_VIEW))) -> list[dict]:
    teams = (
        db.query(Team).filter(Team.tenant_id == tenant.id).order_by(Team.name).all()
    )
    return [_team_dto(t) for t in teams]


@router.post("")
def create_team(body: TeamCreate, db: Db, tenant: Tenant = Depends(get_tenant),
                user: User = Depends(require_perm(TEAM_MANAGE))) -> dict:
    name = body.name.strip()
    if not name:
        raise TicketNotFound("Team name is required")
    existing = db.query(Team).filter(
        Team.tenant_id == tenant.id, Team.name.ilike(name)
    ).first()
    if existing:
        return _team_dto(existing)
    team = Team(tenant_id=tenant.id, name=name)
    db.add(team)
    db.commit()
    db.refresh(team)
    return _team_dto(team)


@router.patch("/{team_id}")
def update_team(team_id: str, body: TeamUpdate, db: Db,
                tenant: Tenant = Depends(get_tenant),
                user: User = Depends(require_perm(TEAM_MANAGE))) -> dict:
    team = _get_team(db, tenant, team_id)
    if body.name and body.name.strip():
        team.name = body.name.strip()
    db.commit()
    db.refresh(team)
    return _team_dto(team)


@router.delete("/{team_id}")
def delete_team(team_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                user: User = Depends(require_perm(TEAM_MANAGE))) -> dict:
    team = _get_team(db, tenant, team_id)
    db.delete(team)
    db.commit()
    return {"ok": True}


@router.post("/{team_id}/members")
def add_team_member(team_id: str, body: TeamMemberAdd, db: Db,
                    tenant: Tenant = Depends(get_tenant),
                    user: User = Depends(require_perm(TEAM_MANAGE))) -> dict:
    team = _get_team(db, tenant, team_id)
    member = db.get(User, body.user_id)
    if not member or member.tenant_id != tenant.id:
        raise TicketNotFound("Agent not found in this tenant")
    if member not in team.members:
        team.members.append(member)
        db.commit()
    db.refresh(team)
    return _team_dto(team)


@router.delete("/{team_id}/members/{user_id}")
def remove_team_member(team_id: str, user_id: str, db: Db,
                       tenant: Tenant = Depends(get_tenant),
                       user: User = Depends(require_perm(TEAM_MANAGE))) -> dict:
    team = _get_team(db, tenant, team_id)
    member = db.get(User, user_id)
    if member and member in team.members:
        team.members.remove(member)
        db.commit()
    db.refresh(team)
    return _team_dto(team)
