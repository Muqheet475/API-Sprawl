import requests
from . import config

def send_slack_alert(data):
    """Sends high-priority alerts to the team Slack channel."""
    if not config.SLACK_WEBHOOK_URL:
        return

    payload = {
        "text": f"🚨 *High Risk API Detected*\n"
                f"*Endpoint:* `{data['endpoint']}`\n"
                f"*Threat:* {data['threat_type']}\n"
                f"*Risk Score:* {data['risk_score']}\n"
                f"*Explanation:* {data['explanation']}"
    }
    try:
        requests.post(config.SLACK_WEBHOOK_URL, json=payload, timeout=5)
    except Exception as e:
        print(f"Slack Notification Error: {e}")

async def send_external_notifications(data):
    """Entry point to trigger multiple notification channels."""
    if getattr(config, "ENABLE_SLACK", False):
        send_slack_alert(data)
    print(f"\n[NOTIFIER] Processing High Risk Alert for: {data['endpoint']}")
    await send_email_test(data)


async def send_email_test(data):
    """Simulates an email being sent to the security team."""
    print("-----------------------------------------")
    print("📧 EMAIL SENT TO: security-team@company.com")
    print(f"SUBJECT: [CRITICAL] High Risk API Detected - {data['endpoint']}")
    print(f"BODY: The Digital Inspector flagged this as a {data['threat_type']}.")
    print(f"RISK SCORE: {data['risk_score']}")
    print("-----------------------------------------")