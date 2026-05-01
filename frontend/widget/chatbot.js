// (c) 2026 Legal Intake System -- developed by Rechtsanwalt Tieben
(function() {
  'use strict';

  const API_BASE_URL = window.CHATBOT_API_URL || 'http://152.53.139.177:3003/api/chatbot';
  let sessionId = null;
  let currentStep = null;
  let stepHistory = [];
  let needsReplay = false;
  let uploadedFiles = [];

  function createChatbotHTML() {
    const chatbotHTML = `
      <div id="jupus-chatbot-container" style="display: none;">
        <div id="jupus-chatbot-header">
          <span>Rechtsanwalt Tieben</span>
          <button id="jupus-chatbot-close">\u00d7</button>
        </div>
        <div id="jupus-chatbot-messages"></div>
        <div id="jupus-chatbot-input-container" style="display:none;">
          <input type="file" id="jupus-chatbot-file-input" style="display: none;" multiple />
          <div id="jupus-chatbot-input-wrapper">
            <input type="text" id="jupus-chatbot-input" placeholder="Nachricht eingeben..." />
            <button id="jupus-chatbot-send">\u2192</button>
          </div>
        </div>
        <div id="jupus-chatbot-footer">Chatbot concept by Rechtsanwalt Tieben</div>
      </div>
      <div id="jupus-chatbot-toggle">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="currentColor"/>
        </svg>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #jupus-chatbot-container {
        position: fixed; bottom: 20px; right: 20px;
        width: 400px; height: 620px;
        background: white; border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.18);
        display: flex; flex-direction: column;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #jupus-chatbot-header {
        background: #3D3D3D; color: white;
        padding: 16px 20px; border-radius: 12px 12px 0 0;
        display: flex; justify-content: space-between; align-items: center;
        font-weight: 600; font-size: 16px; letter-spacing: 0.3px;
      }
      #jupus-chatbot-close {
        background: none; border: none; color: white;
        font-size: 24px; cursor: pointer; padding: 0; line-height: 1;
      }
      #jupus-chatbot-messages {
        flex: 1; overflow-y: auto; padding: 24px 20px;
        background: #f7f7f7; position: relative;
      }
      .jupus-step {
        animation: jupusFadeIn 0.3s ease;
      }
      @keyframes jupusFadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .jupus-step-message {
        background: white; color: #333;
        padding: 16px 20px; border-radius: 12px;
        font-size: 15px; line-height: 1.5;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        margin-bottom: 16px;
      }
      .jupus-choices {
        display: flex; flex-direction: column; gap: 8px;
      }
      .jupus-choice-button {
        background: #6B7B3A; color: white; border: none;
        padding: 13px 18px; border-radius: 10px;
        cursor: pointer; text-align: left; font-size: 14px;
        transition: background 0.2s, transform 0.1s;
      }
      .jupus-choice-button:hover { background: #5A6930; transform: translateX(2px); }
      .jupus-choice-button:active { transform: scale(0.98); }
      .jupus-choice-button.secondary { background: #999; }
      .jupus-choice-button.secondary:hover { background: #777; }
      .jupus-back-button {
        background: none; border: 1px solid #ccc; color: #666;
        padding: 10px 16px; border-radius: 10px;
        cursor: pointer; font-size: 13px; margin-top: 12px;
        transition: all 0.2s; width: 100%;
      }
      .jupus-back-button:hover { border-color: #999; color: #333; background: #f0f0f0; }
      .jupus-input-row {
        display: flex; gap: 8px; align-items: center; margin-bottom: 8px;
      }
      .jupus-input-row input, .jupus-input-row select {
        flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 10px;
        font-size: 14px; outline: none;
      }
      .jupus-input-row input:focus { border-color: #6B7B3A; }
      .jupus-submit-btn {
        background: #6B7B3A; color: white; border: none;
        padding: 12px 20px; border-radius: 10px;
        cursor: pointer; font-size: 14px; font-weight: 500; white-space: nowrap;
      }
      .jupus-submit-btn:hover { background: #5A6930; }
      .jupus-contact-form { display: flex; flex-direction: column; gap: 8px; }
      .jupus-contact-form input {
        padding: 12px; border: 1px solid #ddd; border-radius: 10px;
        font-size: 14px; outline: none;
      }
      .jupus-contact-form input:focus { border-color: #6B7B3A; }
      .jupus-file-list {
        display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;
        overflow: hidden;
      }
      .jupus-file-item {
        display: flex; align-items: center; gap: 8px;
        background: white; padding: 8px 12px; border-radius: 8px;
        font-size: 13px; color: #333;
        border: 1px solid #e0e0e0;
        min-width: 0;
      }
      .jupus-file-item .jupus-file-name {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        flex: 1; min-width: 0;
      }
      .jupus-file-item .jupus-file-icon { color: #6B7B3A; font-size: 16px; flex-shrink: 0; }
      .jupus-file-item .jupus-file-remove {
        margin-left: auto; cursor: pointer; color: #999; font-size: 16px; flex-shrink: 0;
      }
      .jupus-file-item .jupus-file-remove:hover { color: #c00; }
      #jupus-chatbot-input-container {
        padding: 12px; background: white; border-top: 1px solid #e0e0e0;
      }
      #jupus-chatbot-input-wrapper { display: flex; gap: 8px; }
      #jupus-chatbot-input {
        flex: 1; padding: 12px; border: 1px solid #e0e0e0;
        border-radius: 24px; font-size: 14px; outline: none;
      }
      #jupus-chatbot-input:focus { border-color: #6B7B3A; }
      #jupus-chatbot-send {
        background: #6B7B3A; color: white; border: none;
        width: 40px; height: 40px; border-radius: 50%;
        cursor: pointer; font-size: 18px;
        display: flex; align-items: center; justify-content: center;
      }
      #jupus-chatbot-footer {
        text-align: center; padding: 8px; font-size: 11px;
        color: #999; background: #f9f9f9; border-radius: 0 0 12px 12px;
      }
      #jupus-chatbot-toggle {
        position: fixed; bottom: 20px; right: 20px;
        width: 60px; height: 60px; background: #6B7B3A;
        border-radius: 50%; display: flex; align-items: center;
        justify-content: center; cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999; color: white;
        transition: background 0.2s;
      }
      #jupus-chatbot-toggle:hover { background: #5A6930; }
      .jupus-date-wrapper { position: relative; }
      .jupus-date-trigger {
        display: flex; align-items: center; gap: 10px;
        padding: 12px 16px; background: white; border: 1px solid #ddd;
        border-radius: 10px; cursor: pointer; font-size: 14px; color: #333;
        transition: border-color 0.2s;
      }
      .jupus-date-trigger:hover { border-color: #6B7B3A; }
      .jupus-date-trigger .jupus-date-icon { color: #6B7B3A; font-size: 16px; }
      .jupus-date-trigger .jupus-date-placeholder { color: #999; }
      .jupus-calendar {
        background: white; border-radius: 10px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.14);
        overflow: hidden; margin-top: 6px;
        border: 1px solid #e0e0e0;
        display: none;
      }
      .jupus-calendar.open { display: block; animation: jupusFadeIn 0.2s ease; }
      .jupus-cal-nav {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 10px; background: #3D3D3D;
      }
      .jupus-cal-nav button {
        background: none; border: none; color: white;
        font-size: 18px; cursor: pointer; width: 28px; height: 28px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
      }
      .jupus-cal-nav button:hover { background: rgba(255,255,255,0.15); }
      .jupus-cal-title { color: white; font-weight: 600; font-size: 13px; }
      .jupus-cal-grid {
        display: grid; grid-template-columns: repeat(7, 1fr);
        gap: 1px; padding: 6px 8px;
      }
      .jupus-cal-dayname {
        text-align: center; font-size: 10px; font-weight: 600;
        color: #999; padding: 4px 0;
      }
      .jupus-cal-day {
        text-align: center; font-size: 12px; border-radius: 50%;
        cursor: pointer; transition: all 0.12s;
        width: 30px; height: 30px;
        display: flex; align-items: center; justify-content: center;
        margin: 1px auto;
      }
      .jupus-cal-day:hover { background: #f0f3e8; }
      .jupus-cal-day.jupus-cal-today { font-weight: 700; color: #6B7B3A; }
      .jupus-cal-day.jupus-cal-selected {
        background: #6B7B3A; color: white; font-weight: 600;
      }
      .jupus-cal-day.jupus-cal-selected:hover { background: #5A6930; }
      .jupus-cal-day.jupus-cal-disabled {
        color: #ddd; cursor: default; pointer-events: none;
      }
      .jupus-loading-dots { display: flex; gap: 4px; padding: 12px 0; justify-content: center; }
      .jupus-loading-dots span {
        width: 8px; height: 8px; background: #bbb; border-radius: 50%;
        animation: jupusBounce 1.2s infinite;
      }
      .jupus-loading-dots span:nth-child(2) { animation-delay: 0.2s; }
      .jupus-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes jupusBounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.innerHTML = chatbotHTML;
    document.body.appendChild(container);

    return {
      container: document.getElementById('jupus-chatbot-container'),
      toggle: document.getElementById('jupus-chatbot-toggle'),
      messages: document.getElementById('jupus-chatbot-messages'),
      input: document.getElementById('jupus-chatbot-input'),
      sendBtn: document.getElementById('jupus-chatbot-send'),
      fileInput: document.getElementById('jupus-chatbot-file-input'),
      closeBtn: document.getElementById('jupus-chatbot-close'),
      inputContainer: document.getElementById('jupus-chatbot-input-container'),
    };
  }

  async function initChatbot() {
    const elements = createChatbotHTML();

    elements.toggle.addEventListener('click', () => {
      const visible = elements.container.style.display === 'flex';
      elements.container.style.display = visible ? 'none' : 'flex';
      if (!visible && !sessionId) startConversation();
    });

    elements.closeBtn.addEventListener('click', () => {
      elements.container.style.display = 'none';
    });

    elements.sendBtn.addEventListener('click', sendTextMessage);
    elements.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendTextMessage();
    });

    async function startConversation() {
      showLoading();
      try {
        const response = await fetch(`${API_BASE_URL}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        sessionId = data.sessionId;
        currentStep = data.step;
        stepHistory = [];
        needsReplay = false;
        hideLoading();
        renderCurrentStep();
      } catch (error) {
        hideLoading();
        showError('Fehler beim Starten. Bitte versuchen Sie es erneut.');
      }
    }

    async function sendTextMessage() {
      const message = elements.input.value.trim();
      if (!message || !sessionId) return;
      elements.input.value = '';
      elements.inputContainer.style.display = 'none';
      await proceedWithAnswer(message, null);
    }

    function renderCurrentStep() {
      if (!currentStep) return;
      const area = elements.messages;
      area.innerHTML = '';

      const stepDiv = document.createElement('div');
      stepDiv.className = 'jupus-step';

      const msgDiv = document.createElement('div');
      msgDiv.className = 'jupus-step-message';
      msgDiv.textContent = currentStep.message;
      stepDiv.appendChild(msgDiv);

      if (currentStep.type === 'choice' && currentStep.options) {
        renderChoices(stepDiv, currentStep.options);
      } else if (currentStep.type === 'input' && currentStep.inputType === 'date') {
        renderDateInput(stepDiv);
      } else if (currentStep.type === 'input') {
        elements.inputContainer.style.display = '';
        elements.input.focus();
      } else if (currentStep.type === 'file') {
        renderFileUpload(stepDiv);
      } else if (currentStep.type === 'contact') {
        renderContactForm(stepDiv);
      } else if (currentStep.type === 'consent') {
        renderConsent(stepDiv);
      } else if (currentStep.type === 'end') {
        elements.inputContainer.style.display = 'none';
        renderEndActions(stepDiv);
      }

      if (stepHistory.length > 0 && currentStep.type !== 'end') {
        const backBtn = document.createElement('button');
        backBtn.className = 'jupus-back-button';
        backBtn.textContent = '\u2190 Zur\u00fcck';
        backBtn.addEventListener('click', goBack);
        stepDiv.appendChild(backBtn);
      }

      area.appendChild(stepDiv);
    }

    function renderChoices(parent, options) {
      const choicesDiv = document.createElement('div');
      choicesDiv.className = 'jupus-choices';

      options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'jupus-choice-button';
        btn.textContent = option.label;
        btn.addEventListener('click', () => {
          proceedWithAnswer(option.label, index);
        });
        choicesDiv.appendChild(btn);
      });
      parent.appendChild(choicesDiv);
    }

    function renderDateInput(parent) {
      const MONTHS = ['Januar','Februar','M\u00e4rz','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
      const DAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
      const today = new Date();
      let viewYear = today.getFullYear();
      let viewMonth = today.getMonth();
      let selectedDate = null;

      const wrapper = document.createElement('div');
      wrapper.className = 'jupus-date-wrapper';

      const trigger = document.createElement('div');
      trigger.className = 'jupus-date-trigger';
      trigger.innerHTML = '<svg class="jupus-date-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0v1H1.5A1.5 1.5 0 000 2.5v12A1.5 1.5 0 001.5 16h13a1.5 1.5 0 001.5-1.5v-12A1.5 1.5 0 0014.5 1H12V0h-1v1H5V0H4zm0 2v1h1V2h6v1h1V2h2.5a.5.5 0 01.5.5V4H1V2.5a.5.5 0 01.5-.5H4zM1 5h14v9.5a.5.5 0 01-.5.5h-13a.5.5 0 01-.5-.5V5z"/></svg><span class="jupus-date-placeholder">Datum ausw\u00e4hlen...</span>';
      wrapper.appendChild(trigger);

      const cal = document.createElement('div');
      cal.className = 'jupus-calendar';
      wrapper.appendChild(cal);

      const actions = document.createElement('div');
      actions.style.cssText = 'margin-top: 10px;';
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'jupus-submit-btn';
      confirmBtn.style.cssText = 'width: 100%; padding: 12px; opacity: 0.5;';
      confirmBtn.textContent = 'Weiter';
      confirmBtn.disabled = true;
      confirmBtn.addEventListener('click', () => {
        if (!selectedDate) return;
        const formatted = `${pad(selectedDate.getDate())}.${pad(selectedDate.getMonth()+1)}.${selectedDate.getFullYear()}`;
        proceedWithAnswer(formatted, null);
      });
      actions.appendChild(confirmBtn);
      wrapper.appendChild(actions);

      trigger.addEventListener('click', () => {
        cal.classList.toggle('open');
      });

      function renderCal() {
        cal.innerHTML = '';

        const nav = document.createElement('div');
        nav.className = 'jupus-cal-nav';
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '\u2039';
        prevBtn.addEventListener('click', (e) => { e.stopPropagation(); viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderCal(); });
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '\u203a';
        nextBtn.addEventListener('click', (e) => { e.stopPropagation(); viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderCal(); });
        const title = document.createElement('span');
        title.className = 'jupus-cal-title';
        title.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
        nav.appendChild(prevBtn);
        nav.appendChild(title);
        nav.appendChild(nextBtn);
        cal.appendChild(nav);

        const grid = document.createElement('div');
        grid.className = 'jupus-cal-grid';
        DAYS.forEach(d => {
          const hdr = document.createElement('div');
          hdr.className = 'jupus-cal-dayname';
          hdr.textContent = d;
          grid.appendChild(hdr);
        });

        const firstDay = new Date(viewYear, viewMonth, 1);
        let startDay = firstDay.getDay() - 1;
        if (startDay < 0) startDay = 6;
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        for (let i = 0; i < startDay; i++) {
          grid.appendChild(document.createElement('div'));
        }

        for (let d = 1; d <= daysInMonth; d++) {
          const cell = document.createElement('div');
          cell.className = 'jupus-cal-day';
          cell.textContent = d;
          const cellDate = new Date(viewYear, viewMonth, d);

          if (cellDate > today) {
            cell.classList.add('jupus-cal-disabled');
          } else {
            if (selectedDate && selectedDate.getTime() === cellDate.getTime()) {
              cell.classList.add('jupus-cal-selected');
            }
            if (d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()) {
              cell.classList.add('jupus-cal-today');
            }
            cell.addEventListener('click', (e) => {
              e.stopPropagation();
              selectedDate = new Date(viewYear, viewMonth, d);
              const formatted = `${pad(selectedDate.getDate())}.${pad(selectedDate.getMonth()+1)}.${selectedDate.getFullYear()}`;
              trigger.innerHTML = `<svg class="jupus-date-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0v1H1.5A1.5 1.5 0 000 2.5v12A1.5 1.5 0 001.5 16h13a1.5 1.5 0 001.5-1.5v-12A1.5 1.5 0 0014.5 1H12V0h-1v1H5V0H4zm0 2v1h1V2h6v1h1V2h2.5a.5.5 0 01.5.5V4H1V2.5a.5.5 0 01.5-.5H4zM1 5h14v9.5a.5.5 0 01-.5.5h-13a.5.5 0 01-.5-.5V5z"/></svg><span>${formatted}</span>`;
              confirmBtn.disabled = false;
              confirmBtn.style.opacity = '1';
              cal.classList.remove('open');
              renderCal();
            });
          }
          grid.appendChild(cell);
        }
        cal.appendChild(grid);
      }

      function pad(n) { return n < 10 ? '0' + n : '' + n; }

      renderCal();
      parent.appendChild(wrapper);
    }

    function renderFileUpload(parent) {
      uploadedFiles = [];
      const wrapper = document.createElement('div');

      const fileListDiv = document.createElement('div');
      fileListDiv.className = 'jupus-file-list';
      wrapper.appendChild(fileListDiv);

      const btnsDiv = document.createElement('div');
      btnsDiv.className = 'jupus-choices';

      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'jupus-choice-button';
      uploadBtn.textContent = 'Datei ausw\u00e4hlen';
      uploadBtn.addEventListener('click', () => elements.fileInput.click());
      btnsDiv.appendChild(uploadBtn);

      const continueBtn = document.createElement('button');
      continueBtn.className = 'jupus-choice-button secondary';
      continueBtn.textContent = 'Weiter ohne Datei';
      continueBtn.addEventListener('click', () => {
        proceedWithAnswer('Weiter ohne Datei', null, true);
      });
      btnsDiv.appendChild(continueBtn);
      wrapper.appendChild(btnsDiv);
      parent.appendChild(wrapper);

      const MAX_FILES = 15;

      const onFileSelected = async (event) => {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        const remaining = MAX_FILES - uploadedFiles.length;
        if (remaining <= 0) {
          alert(`Maximal ${MAX_FILES} Dateien erlaubt.`);
          elements.fileInput.value = '';
          return;
        }
        const filesToUpload = files.slice(0, remaining);
        if (filesToUpload.length < files.length) {
          alert(`Nur noch ${remaining} Datei${remaining > 1 ? 'en' : ''} möglich. Überschüssige Dateien wurden ignoriert.`);
        }

        for (const file of filesToUpload) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('sessionId', sessionId);

          const item = document.createElement('div');
          item.className = 'jupus-file-item';
          item.innerHTML = `<span class="jupus-file-icon">\u2022</span><span class="jupus-file-name">${file.name} <span style="color:#999;font-size:11px;">(wird hochgeladen...)</span></span>`;
          fileListDiv.appendChild(item);

          try {
            const response = await fetch(`${API_BASE_URL}/upload`, {
              method: 'POST',
              body: formData,
            });
            const data = await response.json();
            uploadedFiles.push({ name: file.name, id: data.fileId });
            item.innerHTML = `<span class="jupus-file-icon">\u2713</span><span class="jupus-file-name" title="${file.name}">${file.name}</span>`;

            const removeBtn = document.createElement('span');
            removeBtn.className = 'jupus-file-remove';
            removeBtn.textContent = '\u00d7';
            removeBtn.addEventListener('click', () => {
              uploadedFiles = uploadedFiles.filter(f => f.id !== data.fileId);
              item.remove();
              uploadBtn.disabled = false;
              uploadBtn.style.opacity = '1';
            });
            item.appendChild(removeBtn);
          } catch (error) {
            item.innerHTML = `<span style="color:#c00;">\u2717</span><span class="jupus-file-name">${file.name} - Fehler</span>`;
          }
        }

        if (uploadedFiles.length >= MAX_FILES) {
          uploadBtn.disabled = true;
          uploadBtn.style.opacity = '0.5';
        }
        continueBtn.textContent = `Weiter (${uploadedFiles.length} Datei${uploadedFiles.length > 1 ? 'en' : ''})`;
        continueBtn.className = 'jupus-choice-button';
        elements.fileInput.value = '';
      };

      elements.fileInput.removeEventListener('change', elements._fileHandler);
      elements._fileHandler = onFileSelected;
      elements.fileInput.addEventListener('change', onFileSelected);
    }

    function renderContactForm(parent) {
      const form = document.createElement('div');
      form.className = 'jupus-contact-form';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Vollst\u00e4ndiger Name';
      form.appendChild(nameInput);

      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.placeholder = 'E-Mail-Adresse';
      form.appendChild(emailInput);

      const phoneInput = document.createElement('input');
      phoneInput.type = 'tel';
      phoneInput.placeholder = 'Telefonnummer';
      form.appendChild(phoneInput);

      const submitBtn = document.createElement('button');
      submitBtn.className = 'jupus-choice-button';
      submitBtn.textContent = 'Absenden';
      submitBtn.addEventListener('click', async () => {
        if (!nameInput.value || !emailInput.value || !phoneInput.value) {
          alert('Bitte f\u00fcllen Sie alle Felder aus.');
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Wird gesendet...';
        try {
          const response = await fetch(`${API_BASE_URL}/contact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              name: nameInput.value,
              email: emailInput.value,
              phone: phoneInput.value,
            }),
          });
          const data = await response.json();
          stepHistory.push({
            step: currentStep,
            answer: `${nameInput.value}, ${emailInput.value}, ${phoneInput.value}`,
            choiceIndex: null,
            type: 'contact',
          });
          currentStep = data.step;
          renderCurrentStep();
        } catch (error) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Absenden';
          showError('Fehler beim Senden.');
        }
      });
      form.appendChild(submitBtn);
      parent.appendChild(form);
    }

    function renderConsent(parent) {
      const btns = document.createElement('div');
      btns.className = 'jupus-choices';

      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'jupus-choice-button';
      acceptBtn.textContent = 'Ich stimme zu';
      acceptBtn.addEventListener('click', () => submitConsent(true));
      btns.appendChild(acceptBtn);

      const declineBtn = document.createElement('button');
      declineBtn.className = 'jupus-choice-button secondary';
      declineBtn.textContent = 'Ablehnen';
      declineBtn.addEventListener('click', () => submitConsent(false));
      btns.appendChild(declineBtn);

      parent.appendChild(btns);
    }

    async function submitConsent(consented) {
      showLoading();
      try {
        const response = await fetch(`${API_BASE_URL}/consent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, consented }),
        });
        const data = await response.json();
        stepHistory.push({
          step: currentStep,
          answer: consented ? 'Zugestimmt' : 'Abgelehnt',
          choiceIndex: null,
          type: 'consent',
        });
        hideLoading();
        currentStep = data.step;
        renderCurrentStep();
      } catch (error) {
        hideLoading();
        showError('Fehler beim Senden.');
      }
    }

    function renderEndActions(parent) {
      const btns = document.createElement('div');
      btns.className = 'jupus-choices';
      btns.style.marginTop = '8px';

      const newBtn = document.createElement('button');
      newBtn.className = 'jupus-choice-button';
      newBtn.textContent = 'Neue Anfrage starten';
      newBtn.addEventListener('click', resetChat);
      btns.appendChild(newBtn);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'jupus-choice-button secondary';
      closeBtn.textContent = 'Chat schlie\u00dfen';
      closeBtn.addEventListener('click', () => {
        elements.container.style.display = 'none';
      });
      btns.appendChild(closeBtn);

      parent.appendChild(btns);
    }

    async function proceedWithAnswer(answer, choiceIndex, isFileSkip) {
      if (!currentStep) {
        showError('Sitzungsfehler. Bitte starten Sie den Chat neu.');
        return;
      }
      stepHistory.push({
        step: currentStep,
        answer: answer,
        choiceIndex: choiceIndex,
        type: currentStep.type,
        files: uploadedFiles.length ? [...uploadedFiles] : null,
      });

      showLoading();

      if (needsReplay) {
        await replaySession();
        needsReplay = false;
      }

      try {
        let data;
        if (isFileSkip || (currentStep.type === 'file' && uploadedFiles.length > 0)) {
          if (uploadedFiles.length === 0) {
            const response = await fetch(`${API_BASE_URL}/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, message: 'skip' }),
            });
            data = await response.json();
          } else {
            const response = await fetch(`${API_BASE_URL}/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, message: 'files_uploaded' }),
            });
            data = await response.json();
          }
        } else {
          const body = { sessionId };
          if (choiceIndex !== null && choiceIndex !== undefined) {
            body.choiceIndex = choiceIndex;
            body.message = answer;
          } else {
            body.message = answer;
          }
          const response = await fetch(`${API_BASE_URL}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          data = await response.json();
        }

        hideLoading();
        currentStep = data.step;
        uploadedFiles = [];
        renderCurrentStep();
      } catch (error) {
        hideLoading();
        stepHistory.pop();
        showError('Fehler. Bitte versuchen Sie es erneut.');
      }
    }

    function goBack() {
      if (stepHistory.length === 0) return;
      const prev = stepHistory.pop();
      currentStep = prev.step;
      needsReplay = true;
      elements.inputContainer.style.display = 'none';
      renderCurrentStep();
    }

    async function replaySession() {
      try {
        const response = await fetch(`${API_BASE_URL}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        sessionId = data.sessionId;

        const entriesToReplay = stepHistory.slice(0, -1);
        for (const entry of entriesToReplay) {
          if (entry.type === 'choice') {
            await fetch(`${API_BASE_URL}/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                choiceIndex: entry.choiceIndex,
              }),
            });
          } else if (entry.type === 'input') {
            await fetch(`${API_BASE_URL}/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, message: entry.answer }),
            });
          } else if (entry.type === 'file') {
            await fetch(`${API_BASE_URL}/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, message: 'skip' }),
            });
          }
        }
      } catch (error) {
        console.error('Error replaying session:', error);
      }
    }

    function resetChat() {
      sessionId = null;
      currentStep = null;
      stepHistory = [];
      needsReplay = false;
      uploadedFiles = [];
      elements.messages.innerHTML = '';
      elements.inputContainer.style.display = 'none';
      startConversation();
    }

    function showLoading() {
      const area = elements.messages;
      let loader = document.getElementById('jupus-loader');
      if (!loader) {
        loader = document.createElement('div');
        loader.id = 'jupus-loader';
        loader.className = 'jupus-loading-dots';
        loader.innerHTML = '<span></span><span></span><span></span>';
        area.appendChild(loader);
      }
    }

    function hideLoading() {
      const loader = document.getElementById('jupus-loader');
      if (loader) loader.remove();
    }

    function showError(msg) {
      const area = elements.messages;
      const err = document.createElement('div');
      err.className = 'jupus-step-message';
      err.style.color = '#c00';
      err.textContent = msg;
      area.appendChild(err);
    }
  }

  async function checkEnabledThenInit() {
    try {
      const res = await fetch(`${API_BASE_URL}/status`);
      const data = await res.json();
      if (!data.enabled) return;
    } catch { /* if status check fails, load anyway */ }
    initChatbot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkEnabledThenInit);
  } else {
    checkEnabledThenInit();
  }
})();
