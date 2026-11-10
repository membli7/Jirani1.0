import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAttendance, saveAttendance, todayNairobiDate } from "../attendanceActions.mjs";

function translate(value) {
  return window.jiraniI18n?.translateText(value) || value;
}

function roleName(role) {
  return window.jiraniI18n?.roleName(role) || (role ? `${role[0].toUpperCase()}${role.slice(1)}` : "");
}

function formatDate(value) {
  const dateValue = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00+03:00`
    : value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(new Date(dateValue));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(new Date(value));
}

function choicesFor(attendanceData, date) {
  if (!attendanceData) return [];
  const register = attendanceData.registers.find(item => item.date === date);
  const current = new Map((register?.attendees || []).map(item => [item.userId, item]));
  const visibleMembers = new Map(attendanceData.members.map(member => [member.id, {
    userId: member.id,
    name: member.name,
    present: current.get(member.id)?.present ?? false,
  }]));
  for (const attendee of register?.attendees || []) {
    if (!visibleMembers.has(attendee.userId)) visibleMembers.set(attendee.userId, attendee);
  }
  return [...visibleMembers.values()].sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function attendanceErrorMessage(error) {
  return error instanceof TypeError
    ? "Cannot reach the server. Check that it is running, then try again."
    : error?.message || "The attendance register could not be loaded.";
}

export default function AttendancePanel() {
  const [user, setUser] = useState(null);
  const [attendanceData, setAttendanceData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayNairobiDate);
  const [choices, setChoices] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(false);
  const [, setLanguageVersion] = useState(0);
  const dialogRef = useRef(null);
  const writeOwner = useRef({});
  const writeRequester = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const secretary = user?.role === "secretary";
  const registers = attendanceData?.registers || [];
  const register = registers.find(item => item.date === selectedDate);
  const editHistory = Array.isArray(register?.history) ? register.history : [];
  const latestEdit = editHistory.at(-1);
  const presentCount = choices.filter(item => item.present).length;

  useEffect(() => {
    let controller;
    const loadForDashboard = event => {
      const nextUser = event.detail?.user || null;
      setActive(event.detail?.activePage === "attendance-panel");
      setUser(nextUser);
      setError("");
      setStatus("");
      if (!nextUser) {
        setAttendanceData(null);
        return;
      }
      controller?.abort();
      controller = new AbortController();
      fetchAttendance(window.fetch.bind(window), controller.signal)
        .then(data => { setAttendanceData(data); setError(""); })
        .catch(loadError => {
          if (controller.signal.aborted) return;
          if (loadError.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
          setAttendanceData(null);
          setError(attendanceErrorMessage(loadError));
        });
    };
    const selectPage = event => setActive(event.detail?.panelId === "attendance-panel");
    const onLanguageChange = () => setLanguageVersion(value => value + 1);
    window.addEventListener("chama:dashboard-state", loadForDashboard);
    window.addEventListener("chama:app-page", selectPage);
    window.addEventListener("languagechange", onLanguageChange);
    return () => {
      controller?.abort();
      window.removeEventListener("chama:dashboard-state", loadForDashboard);
      window.removeEventListener("chama:app-page", selectPage);
      window.removeEventListener("languagechange", onLanguageChange);
    };
  }, []);

  useEffect(() => {
    if (secretary) setChoices(choicesFor(attendanceData, selectedDate));
    else setChoices([]);
  }, [attendanceData, selectedDate, secretary]);

  const personalAttendance = register?.attendees?.find(item => item.userId === user?.id);
  const latestChanges = latestEdit?.changes?.map(change => change.from
    ? `changed ${change.name} from ${change.from} to ${change.to}${change.from === "present" && change.to === "absent" ? " (removed from present)" : ""}`
    : `recorded ${change.name} as ${change.to}`).join("; ");
  const attribution = register
    ? `Created by ${roleName(register.createdBy?.role)} on ${formatDate(register.createdAt)} at ${formatTime(register.createdAt)}.${latestEdit ? ` Last edited by ${roleName(latestEdit.by?.role)} at ${formatDate(latestEdit.at)} ${formatTime(latestEdit.at)} (${latestChanges || "edit recorded"}).` : ""}`
    : "";

  function confirmOverwrite() {
    const dialog = dialogRef.current;
    if (!dialog?.showModal) return Promise.resolve(window.confirm("This meeting already has a register. Saving will replace its attendance and record the changes."));
    return new Promise(resolve => {
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
      dialog.showModal();
    });
  }

  async function handleSave() {
    if (!secretary || saving || !selectedDate) return;
    if (register && !(await confirmOverwrite())) return;
    setSaving(true);
    setError("");
    setStatus("Saving attendance register…");
    try {
      const result = await saveAttendance(writeRequester, writeOwner.current, {
        date: selectedDate,
        expectedRevision: register?.revision ?? null,
        attendees: choices.map(item => ({ userId: item.userId, present: item.present })),
      });
      if (result.data?.date) {
        setAttendanceData(current => {
          if (!current) return current;
          const updated = [result.data, ...current.registers.filter(item => item.date !== result.data.date)]
            .sort((left, right) => right.date.localeCompare(left.date));
          return { ...current, registers: updated };
        });
      }
      setStatus(result.message || "Attendance register saved.");
      try {
        setAttendanceData(await fetchAttendance(window.fetch.bind(window)));
      } catch {
        setError("The register was saved, but the latest meeting history could not be loaded. Reload before making another edit.");
      }
    } catch (saveError) {
      if (saveError.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setStatus("");
      setError(attendanceErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  const emptyView = !attendanceData && !error
    ? "Loading meeting attendance…"
    : "No attendance register for this date.";

  return <section className="panel attendance-panel" id="attendance-panel" data-page-inactive={String(!active)} aria-labelledby="attendance-title">
    <div className="panel-heading">
      <div>
        <h2 id="attendance-title">Meetings · attendance register</h2>
        <p>Choose a meeting date to record attendance or review meeting history.</p>
      </div>
      <span className="status-pill" hidden={secretary}>View-only for non-Secretary</span>
    </div>
    <div className="form-body">
      <label className="field" htmlFor="attendance-date">Meeting date<input id="attendance-date" type="date" required value={selectedDate} onChange={event => { setSelectedDate(event.target.value); setError(""); setStatus(""); }} /></label>
      {secretary ? <div id="attendance-editor">
        <div className="attendance-quick-actions">
          <button className="mini-btn" type="button" onClick={() => setChoices(current => current.map(item => ({ ...item, present: true })))}>Mark all present</button>
          <button className="mini-btn" type="button" onClick={() => setChoices(current => current.map(item => ({ ...item, present: false })))}>Mark all absent</button>
        </div>
        <div className="attendance-members" role="group" aria-label="Member attendance" data-i18n-aria-label="memberAttendance">
          {!attendanceData && !error ? <p className="empty-state">Loading attendance…</p> : choices.length ? choices.map(item => <label className="attendance-row" key={item.userId}>
            <span>{item.name}</span>
            <input type="checkbox" checked={item.present} onChange={event => setChoices(current => current.map(choice => choice.userId === item.userId ? { ...choice, present: event.target.checked } : choice))} />
            <span>{item.present ? "Present" : "Absent"}</span>
          </label>) : <p className="empty-state">No active members to record.</p>}
        </div>
        <div className="attendance-summary-actions">
          <strong aria-live="polite">{`${presentCount} ${translate("present")} · ${choices.length - presentCount} ${translate("absent")} · ${choices.length} ${translate("members")}`}</strong>
          <button className="button-primary" type="button" onClick={handleSave} disabled={!attendanceData || choices.length === 0 || saving}>{saving ? "Saving…" : register ? "Save changes" : "Save register"}</button>
        </div>
      </div> : <div id="attendance-view">
        {user?.role === "member" && <p className="form-note">{personalAttendance ? `Your attendance: ${personalAttendance.present ? "Present" : "Absent"}` : "Your attendance is not listed in this register."}</p>}
        <div className="attendance-members">
          {register ? register.attendees.length ? register.attendees.map(item => <div className="attendance-row" key={item.userId}><span>{item.name}</span><strong>{item.present ? "Present" : "Absent"}</strong></div>) : <p className="empty-state">No attendance details recorded.</p> : <p className="empty-state">{emptyView}</p>}
        </div>
      </div>}
      {error && <p className="form-note error" role="alert">{error}</p>}
      {status && <p className="form-note" role="status" aria-live="polite">{status}</p>}
      <p className="form-note">{attribution}</p>
      {Boolean(register && editHistory.length) && <details>
        <summary>Edit history</summary>
        <div className="schedule-body">{editHistory.map((item, index) => {
          const changes = item.changes.length ? item.changes.map(change => change.from
            ? `changed ${change.name} from ${change.from} to ${change.to}${change.from === "present" && change.to === "absent" ? " (removed from present)" : ""}`
            : `recorded ${change.name} as ${change.to}`).join("; ") : "No attendance changes.";
          return <div className="schedule-item" key={`${item.at}-${index}`}><div><strong>Edited by {roleName(item.by?.role)} {item.by?.name}</strong><span className="schedule-sub">{formatDate(item.at)} at {formatTime(item.at)} · {changes}</span></div></div>;
        })}</div>
      </details>}
      <div>
        <h3 className="attendance-history-title">Meeting history</h3>
        <div className="schedule-body" aria-live="polite">
          {registers.length ? registers.map(item => <div className="schedule-item" key={item.id}>
            <div><strong>{formatDate(item.date)}</strong><span className="schedule-sub">{item.presentCount} present · {item.absentCount} absent · {item.memberCount} members</span></div>
            <button className="panel-link" type="button" onClick={() => { setSelectedDate(item.date); setError(""); setStatus(""); }}>Open register</button>
          </div>) : <div className="empty-state">{attendanceData ? "No meeting attendance recorded yet." : emptyView}</div>}
        </div>
      </div>
    </div>
    <dialog ref={dialogRef} aria-labelledby="attendance-overwrite-title">
      <form method="dialog">
        <h2 id="attendance-overwrite-title">Update attendance register?</h2>
        <p>This meeting already has a register. Saving will replace its attendance and record the changes.</p>
        <div className="dialog-actions">
          <button value="cancel" className="mini-btn" type="submit">Cancel</button>
          <button value="confirm" className="button-primary" type="submit">Continue</button>
        </div>
      </form>
    </dialog>
  </section>;
}
