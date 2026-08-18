from enum import Enum


class Role(str, Enum):
    SUPER_ADMIN = "super_admin"
    OWNER = "owner"
    AGENT = "agent"
    CUSTOMER = "customer"


class TicketStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING_FOR_CUSTOMER = "waiting_for_customer"
    WAITING_INTERNAL = "waiting_internal"
    ESCALATED = "escalated"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TicketType(str, Enum):
    COMPLAINT = "complaint"
    REQUEST = "request"
    INQUIRY = "inquiry"
    UNCLASSIFIED = "unclassified"


class MessageSender(str, Enum):
    CUSTOMER = "customer"
    AI_BOT = "ai_bot"
    HUMAN_AGENT = "human_agent"
    SYSTEM = "system"


class KnowledgeType(str, Enum):
    PDF = "pdf"
    LINK = "link"
    RAW_TEXT = "raw_text"


class TenantStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    TERMINATED = "terminated"


class SubscriptionStatus(str, Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"


class InviteRole(str, Enum):
    OWNER = "owner"
    AGENT = "agent"


class NotificationType(str, Enum):
    ESCALATION = "escalation"
    TICKET_ASSIGNED = "ticket_assigned"
    NEW_REPLY = "new_reply"
    SUSPENSION = "suspension"
    SYSTEM = "system"
