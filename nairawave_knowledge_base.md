# NairaWave Fintech — Official Knowledge Base

> **Client:** NairaWave Fintech (`nairawave` / `t1`)  
> **Target Uses:**  
> 1. Vector Search / RAG Embedding on the Upload portal (`/dashboard/upload` -> **Raw text** or **Files**).  
> 2. Help Centre Knowledge Base Articles on the Agent / Customer Portal (`/dashboard/kb` or `/[tenantSlug]/portal`).  
> 3. Live Chat Widget AI deflections & automated responses.

---

## SECTION 1: MASTER RAW TEXT FOR VECTOR EMBEDDING (RAG)
*(Copy and paste the entire block below into `/dashboard/upload` > **Raw text**, with title **"NairaWave Comprehensive Knowledge Base 2026"** to embed into ChromaDB)*

```text
NAIRAWAVE FINTECH CUSTOMER SUPPORT & POLICY KNOWLEDGE BASE

1. ABOUT NAIRAWAVE FINTECH
NairaWave Fintech is a licensed digital banking and payment service provider operating under Central Bank of Nigeria (CBN) regulatory guidelines, with customer deposits insured by the Nigeria Deposit Insurance Corporation (NDIC).
- Official Support Email: support@nairawave.ng
- Customer Care Phone: +234 (01) 888 9283 / +234 800 NAIRAWAVE
- Official Website: https://nairawave.ng
- USSD Self-Service Code: *737*1#
- Support Operating Hours: AI Support available 24/7/365. Human specialist desk available Monday to Sunday, 8:00 AM – 10:00 PM West Africa Time (WAT).

2. ACCOUNT TIERS, KYC VERIFICATION & TRANSACTION LIMITS
To comply with CBN anti-money laundering (AML) directives, NairaWave accounts are categorized into three verification tiers:
- Tier 1 (Basic/Starter):
  * Requirements: Full legal name, valid Nigerian phone number, date of birth.
  * Daily transfer limit: NGN 50,000.
  * Maximum cumulative account balance: NGN 300,000.
- Tier 2 (Standard):
  * Requirements: Tier 1 requirements plus Bank Verification Number (BVN) and a live biometric facial selfie verification.
  * Daily transfer limit: NGN 200,000.
  * Maximum cumulative account balance: NGN 1,000,000.
- Tier 3 (Premium / Unlimited):
  * Requirements: Tier 2 requirements plus National Identification Number (NIN) and valid Proof of Address (utility bill issued within the last 3 calendar months, e.g., PHCN, water board, or tenancy agreement).
  * Daily transfer limit: NGN 5,000,000.
  * Maximum cumulative account balance: Unlimited.
To upgrade your tier, navigate to Profile -> KYC & Verification in the NairaWave mobile app or web portal and upload the required documents. Approvals are processed within 15 to 30 minutes.

3. MONEY TRANSFERS & SETTLEMENT SLAS
- Intra-Bank Transfers (NairaWave to NairaWave):
  * Status: Instant real-time settlement 24/7.
  * Speed: 99.9% of transfers are credited within 5 seconds.
  * Transfer Fee: Completely free (NGN 0.00) with no monthly limits.
- Inter-Bank Outbound Transfers (NairaWave to Other Nigerian Banks via NIBSS NIP):
  * Typical Speed: 2 to 10 minutes during standard banking hours.
  * Service Level Agreement (SLA): Maximum 2 hours during inter-bank network congestion.
  * Stuck or Pending Transfers: If an outbound transfer shows "Processing" or "Pending" past 2 hours, the customer should provide the 30-digit NIBSS Session ID or transaction reference. Our settlement desk will trace the transaction end-to-end with the beneficiary bank.
  * Reversals: If an interbank transfer fails at the receiving bank, NIBSS will initiate an automatic reversal back into your NairaWave account within 24 hours.

4. CARDS (VIRTUAL & PHYSICAL DEBIT CARDS)
- Physical Debit Cards (Mastercard & Verve):
  * Order Fee: NGN 1,500 (one-time issuance fee).
  * Delivery Window: 3 to 5 business days nationwide.
  * Card Activation: Go to Cards -> Set Card PIN in the app.
- Virtual Dollar & Naira Cards:
  * First virtual card is issued free of charge.
  * Optimized for online international and local payments (Netflix, Spotify, Amazon, Apple Music, Google Play).
- Card Security Controls:
  * Instant In-App Freeze: Lock your card instantly under Cards -> Freeze Card if misplaced or stolen.
  * Online & International Toggles: Enable or disable web payments, contactless (NFC), and ATM cash withdrawals at any time.
- Declined Card Charges with Debit (Pre-Authorisation Holds):
  * If your card was declined at a POS terminal or ATM but your account was debited, the transaction is held in pre-authorisation by the acquiring bank.
  * Resolution SLA: Such pre-authorisation holds auto-reverse into your account within 24 to 48 business hours. If not reversed after 48 hours, raise a ticket with the merchant name, date, and receipt copy.

5. PRICING & FEE SCHEDULE (2026 EDITION)
- Account opening and monthly account maintenance fees: NGN 0.00 (Free forever).
- Transfers to other NairaWave accounts: Free (NGN 0.00).
- Transfers to other banks:
  * Transfers below NGN 10,000: NGN 15.00 flat fee.
  * Transfers NGN 10,000 and above: NGN 25.00 flat fee.
- Utility & Bill Payments (Electricity/PHCN, DSTV, GOTV, Startimes, Internet): NGN 0.00 convenience fee.
- Airtime and Mobile Data purchases: 0% fee (Free).
- ATM Withdrawals:
  * At NairaWave Partner Bank ATMs: NGN 45 per withdrawal.
  * Card withdrawals at NairaWave POS Agent locations: Free up to NGN 20,000 per day; NGN 100 per withdrawal thereafter.
- Duplicate bank statement PDF generation: Free in-app; stamped official embassy letter format: NGN 200.

6. SECURITY, FRAUD PREVENTION & PIN MANAGEMENT
- How to Reset Your Transaction PIN:
  * In-App: Open NairaWave app -> Settings -> Security -> Reset Transfer PIN -> Complete biometric facial verification or enter the one-time password (OTP) sent to your registered email.
  * USSD: Dial *737*1# from your registered mobile telephone number and select Option 4 (Security & PIN).
- Cardinal Security Rules:
  * NairaWave staff and automated agents will NEVER ask for your Transaction PIN, Online Banking Password, One-Time Password (OTP), or Card CVV (3 digits on the back of your card).
  * Never click unsolicited SMS or WhatsApp links offering giveaways or account upgrade promises.
- Reporting Fraud or Suspected Intrusion:
  * To lock your account immediately, dial *737*1*99# or type "freeze account" / "escalate" in our support chat widget.
  * Our anti-fraud operations team will freeze outbound transfers and review activity immediately.

7. DISPUTE RESOLUTION, FAILED DEBITS & REFUND POLICIES
- Failed Airtime / Data Top-up: Auto-reversal occurs within 15 minutes. If airtime is not received after 1 hour, provide phone number and network provider to support.
- Failed POS / Merchant Double Billing: Submit a dispute form with the merchant receipt. Merchant chargeback disputes are resolved in collaboration with NIBSS within 5 to 7 business days.
- General Refund Policy:
  * Any uncredited transfer or erroneous debit confirmed by our audit log is reviewed within 2 business hours.
  * Approved refunds settle directly into the customer's NairaWave wallet within 24 to 48 hours, accompanied by an instant SMS and email confirmation.
```

---

## SECTION 2: MODULAR ARTICLES FOR HELP CENTRE / PORTAL
*(These articles can be created via `/dashboard/kb` or `/articles` API for the Customer Portal)*

### Article 1: How Interbank Transfers Work and What to Do If a Payment Is Stuck
- **Category:** `Transfers`
- **Status:** `published`
- **Snippet:** Most transfers settle in minutes; learn what to do if a transfer is pending past 2 hours.
- **Content:**
```markdown
# How Interbank Transfers Work & Resolving Stuck Payments

At NairaWave, transfers to other NairaWave users settle instantly, 24 hours a day, 7 days a week.

### Interbank Transfers (to GTBank, Access, Zenith, Kuda, OPay, etc.)
Transfers sent to other Nigerian banks are processed via the **NIBSS Instant Payment (NIP)** network:
- **Typical delivery time:** 2 to 10 minutes.
- **High network traffic periods:** May take up to 2 hours.

### What Should I Do If My Transfer Shows "Processing"?
1. **Wait 2 Hours:** In 95% of delayed cases, the beneficiary bank completes the credit within 2 hours without manual intervention.
2. **Retrieve the NIP Session ID:** Open the transaction in your NairaWave transaction history and tap **"Share Receipt"** to copy the 30-digit Session ID.
3. **Contact Support:** If the funds have not arrived after 2 hours and have not reversed into your account, tap the chat widget or email `support@nairawave.ng` with your Session ID. Our settlement desk will trace it directly with the receiving bank.
```

---

### Article 2: Card Declined but Debited? Understanding Pre-Authorisation Holds
- **Category:** `Cards`
- **Status:** `published`
- **Snippet:** Why your account was debited after a POS/ATM decline and when your money will return.
- **Content:**
```markdown
# Card Declined but Debited? Understanding Pre-Authorisation Holds

If you attempted to make a payment at a POS terminal, ATM, or online website and the machine displayed **"Transaction Declined"** or **"Issuer Inoperative"**, but you received a debit alert:

### Why Did This Happen?
When you swipe or insert your card, NairaWave authorizes the funds. If the merchant's machine loses connection before receiving authorization confirmation, the merchant's bank does not complete the settlement, creating a **temporary pre-authorisation hold**.

### When Will My Money Be Returned?
- **Automatic Reversal SLA:** In accordance with CBN regulations, the majority of failed card debits auto-reverse within **24 to 48 business hours**.
- **No Action Needed:** You usually do not need to fill out a paper dispute form if less than 48 hours have elapsed.

### What If It Exceeds 48 Hours?
If 48 hours have passed and the money has not returned:
1. Obtain a copy of the merchant's decline slip (or a screenshot of the failed online checkout).
2. Open our live chat widget and select **"Report Card Issue"** or email `support@nairawave.ng`.
3. We will log a formal chargeback with the merchant's acquiring bank.
```

---

### Article 3: NairaWave KYC Verification Tiers & Daily Transaction Limits
- **Category:** `Account & Verification`
- **Status:** `published`
- **Snippet:** Complete breakdown of Tier 1, Tier 2, and Tier 3 requirements and limits.
- **Content:**
```markdown
# NairaWave KYC Verification Tiers & Daily Limits

To protect our community and satisfy Central Bank of Nigeria (CBN) regulations, transaction limits are tied to your KYC (Know Your Customer) level.

| Tier Level | Requirements | Daily Transfer Limit | Max Cumulative Balance |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Starter)** | Full Name, Phone Number, Date of Birth | ₦50,000 | ₦300,000 |
| **Tier 2 (Standard)** | Tier 1 + BVN + Live Facial Biometric | ₦200,000 | ₦1,000,000 |
| **Tier 3 (Premium)** | Tier 2 + NIN + Recent Utility Bill (≤ 3 mos) | ₦5,000,000 | Unlimited |

### How to Upgrade Your Account Tier
1. Open the NairaWave app and go to **Profile** > **KYC & Limits**.
2. Select the tier you wish to unlock.
3. Follow the instructions to link your BVN/NIN or upload your proof of address.
4. Our automated verification system reviews submissions within **15 to 30 minutes**.
```

---

### Article 4: NairaWave Fee Schedule & Pricing (2026)
- **Category:** `Fees & Pricing`
- **Status:** `published`
- **Snippet:** Transparent breakdown of transfer fees, card issuance, ATM rates, and bill payments.
- **Content:**
```markdown
# NairaWave Fee Schedule & Pricing

We believe in complete transparency with zero hidden charges.

### Transfers
- **NairaWave to NairaWave:** ₦0.00 (Free, unlimited).
- **Outbound to Other Banks (< ₦10,000):** ₦15.00 flat fee.
- **Outbound to Other Banks (≥ ₦10,000):** ₦25.00 flat fee.

### Bills & Utilities
- **Electricity (PHCN/Discos):** ₦0.00 convenience fee.
- **Cable TV (DSTV, GOTV, Startimes):** ₦0.00 convenience fee.
- **Airtime & Mobile Data:** ₦0.00 service charge.

### Cards & Cash Withdrawals
- **Physical Card Issuance / Replacement:** ₦1,500 (covers nationwide dispatch).
- **Virtual Card:** 1st virtual card is free.
- **ATM Withdrawals (Partner Banks):** ₦45.00 per transaction.
- **NairaWave Agent POS Cash-out:** Free up to ₦20,000 daily; ₦100 per transaction thereafter.
- **Account Maintenance / SMS Alert Fees:** ₦0.00 (Free forever).
```

---

### Article 5: Security Best Practices & How to Reset Your Transfer PIN
- **Category:** `Security`
- **Status:** `published`
- **Snippet:** Step-by-step instructions to reset your PIN and protect your account from fraud.
- **Content:**
```markdown
# Security Best Practices & PIN Reset Guide

Your financial security is our top priority.

### How to Reset Your Transfer PIN
- **Via the Mobile App:**
  1. Go to **Settings** > **Security** > **Reset PIN**.
  2. Perform a brief facial recognition scan.
  3. Enter the 6-digit OTP sent to your registered email address.
  4. Set your new 4-digit Transaction PIN.
- **Via USSD Code:**
  1. Dial `*737*1#` from the phone number linked to your account.
  2. Select **Option 4 (Security & PIN)** and follow the on-screen prompts.

### Important Anti-Fraud Reminders
- **NairaWave will NEVER ask for your PIN, OTP, or Card CVV.** If anyone calls or messages you claiming to be support and requests these, hang up immediately.
- If you notice suspicious activity, tap **Freeze Account** in the app or dial `*737*1*99#` to instantly halt all outbound transactions.
```

---

## SECTION 3: TEST PROMPTS TO VERIFY THE AI AGENT IN THE PORTAL & CHAT WIDGET

You can test the chat widget or portal AI with these customer questions:

1. *"Why was I debited when the POS machine showed transaction declined?"*  
   👉 **Expected AI Answer:** Explains pre-authorisation hold, 24–48 hours auto-reversal SLA, and reassurance that no funds are lost.
2. *"How much does NairaWave charge to transfer 50k to Zenith Bank?"*  
   👉 **Expected AI Answer:** Clarifies that transfers of ₦10,000 and above have a flat fee of ₦25.00 (and transfers under ₦10k are ₦15).
3. *"What documents do I need to upgrade to Tier 3, and what is my daily transfer limit?"*  
   👉 **Expected AI Answer:** Mentions Tier 3 requires BVN, NIN, and utility bill within 3 months, granting a ₦5,000,000 daily transfer limit and unlimited balance.
4. *"My transfer has been showing processing for 3 hours, what should I do?"*  
   👉 **Expected AI Answer:** Explains that NIP SLA is up to 2 hours, advises getting the 30-digit NIBSS Session ID from the receipt, and offers to escalate to human settlement agents.
5. *"I forgot my transfer PIN, how can I reset it?"*  
   👉 **Expected AI Answer:** Gives the in-app biometric/OTP reset steps and the `*737*1#` USSD option.
