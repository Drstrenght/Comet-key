let PASSWORD = "";

function login() {
    PASSWORD = document.getElementById("password").value;
    document.getElementById("login").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
}

async function saveScript() {
    const script = document.getElementById("scriptArea").value;

    await fetch("/admin/script", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-admin-password": PASSWORD
        },
        body: JSON.stringify({ script })
    });

    alert("Saved!");
}

async function genKey() {
    const days = document.getElementById("days").value;
    const sessions = document.getElementById("sessions").value;

    const res = await fetch("/admin/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-admin-password": PASSWORD
        },
        body: JSON.stringify({
            days: Number(days),
            maxSessions: Number(sessions)
        })
    });

    const data = await res.json();
    document.getElementById("output").innerText = data.key;
}