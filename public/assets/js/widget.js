/**
 * Website Live Chat Widget Script (Tawk.to / Crisp Style)
 * Sales Reply AI SaaS Engine - Version 2.2
 */
(function () {
    'use strict';

    // 1. Script tag configuration reading
    var scriptTag = document.currentScript || (function () {
        var scripts = document.getElementsByTagName('script');
        return scripts[scripts.length - 1];
    })();

    var widgetToken = scriptTag ? scriptTag.getAttribute('data-token') : null;
    if (!widgetToken) {
        console.error('[Sales Reply AI Widget] Missing data-token attribute in script tag.');
        return;
    }

    // Determine Base URL from script src
    var scriptSrc = scriptTag.src;
    var baseUrl = scriptSrc ? scriptSrc.substring(0, scriptSrc.indexOf('/js/widget.js')) : window.location.origin;

    // Visitor ID & Cookie Persistence (Fallback sync across localStorage & Cookies)
    var STORAGE_KEY = 'sra_visitor_uuid';
    function getVisitorId() {
        var id = null;
        try { id = localStorage.getItem(STORAGE_KEY); } catch (e) {}
        if (!id) {
            var match = document.cookie.match(/(?:^|; )sra_visitor_uuid=([^;]*)/);
            if (match) id = decodeURIComponent(match[1]);
        }
        if (!id) {
            id = 'vis_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        }
        try { localStorage.setItem(STORAGE_KEY, id); } catch (e) {}
        try { document.cookie = 'sra_visitor_uuid=' + encodeURIComponent(id) + '; path=/; max-age=31536000; SameSite=Lax'; } catch (e) {}
        return id;
    }

    var visitorId = getVisitorId();

    // State variables
    var config = {
        primaryColor: '#8B5CF6',
        bgColor: '#0F172A',
        textColor: '#FFFFFF',
        headerBg: '#8B5CF6',
        headerTextColor: '#FFFFFF',
        widgetTitle: 'Customer Support',
        agentName: 'Support Agent',
        welcomeMessage: 'Hello! How can we help you today?',
        botAvatar: null,
        hideBranding: false,
        customBrandingText: null,
        prechatMode: 'disabled',
        prechatAskName: true,
        prechatAskPhone: true,
        prechatAskEmail: false,
        aiActive: true,
        replyDelayEnabled: false,
        replyDelaySeconds: 3,
        allowImageUpload: true,
        allowVoiceRecord: true,
        voiceReplyEnabled: false
    };
    var isOpen = false;
    var pollInterval = null;
    var isPrechatSubmitted = false;
    try { isPrechatSubmitted = localStorage.getItem('sra_prechat_done_' + widgetToken) === 'true'; } catch(e) {}
    var visitorName = '';
    var visitorPhone = '';
    var visitorEmail = '';
    try {
        visitorName = localStorage.getItem('sra_vis_name') || '';
        visitorPhone = localStorage.getItem('sra_vis_phone') || '';
        visitorEmail = localStorage.getItem('sra_vis_email') || '';
    } catch(e) {}

    // Media & Voice State
    var pendingImageFile = null;
    var pendingAudioBlob = null;
    var pendingAudioDuration = 0;
    var mediaRecorder = null;
    var audioChunks = [];
    var recTimer = null;
    var recSeconds = 0;

    // DOM references (initialized upon successful token validation)
    var container = null;
    var toggleBtn = null;
    var closeBtn = null;
    var chatBox = null;
    var chatBody = null;
    var chatInput = null;
    var sendBtn = null;
    var attachBtn = null;
    var fileInput = null;
    var micBtn = null;
    var previewBox = null;
    var previewThumb = null;
    var removeAttachBtn = null;
    var recBar = null;
    var recTimeEl = null;
    var recCancelBtn = null;
    var iconOpen = null;
    var iconClose = null;
    var typingRow = null;
    var brandingEl = null;

    // 2. Mount DOM and Styles only after server validation succeeds
    function mountWidget() {
        if (container) return; // Already mounted

        // Inject CSS Styles
        var styleEl = document.createElement('style');
        styleEl.id = 'sra-widget-style';
        styleEl.innerHTML = `
        :root {
            --sra-primary: #8B5CF6;
            --sra-bg: #0F172A;
            --sra-text: #FFFFFF;
            --sra-header-bg: #8B5CF6;
            --sra-header-text: #FFFFFF;
        }
        .sra-widget-wrapper {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            box-sizing: border-box;
        }
        .sra-widget-wrapper * { box-sizing: border-box; margin: 0; padding: 0; }
        
        /* Floating Button */
        .sra-widget-btn {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: var(--sra-header-bg, var(--sra-primary, #8B5CF6));
            color: var(--sra-header-text, #ffffff);
            border: none;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0,0,0,0.12);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            position: relative;
        }
        .sra-widget-btn:hover {
            transform: scale(1.08);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
        }
        .sra-widget-btn svg { width: 26px; height: 26px; fill: currentColor; transition: transform 0.3s; }
        .sra-widget-badge-pulse {
            position: absolute;
            top: 2px; right: 2px;
            width: 14px; height: 14px;
            background: #10B981;
            border: 2px solid #ffffff;
            border-radius: 50%;
        }

        /* Chat Window Container */
        .sra-chat-box {
            position: absolute;
            bottom: 76px;
            right: 0;
            width: 380px;
            max-width: calc(100vw - 32px);
            height: 560px;
            max-height: calc(100vh - 120px);
            background: var(--sra-bg, #0f172a);
            color: var(--sra-text, #f8fafc);
            border-radius: 20px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            opacity: 0;
            transform: translateY(20px) scale(0.95);
            pointer-events: none;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sra-chat-box.open {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
        }

        /* Header */
        .sra-chat-header {
            background: var(--sra-header-bg, var(--sra-primary, #8B5CF6));
            color: var(--sra-header-text, #ffffff);
            padding: 16px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            flex-shrink: 0;
        }
        .sra-header-info { display: flex; align-items: center; gap: 12px; }
        .sra-header-avatar {
            width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2);
            display: flex; align-items: center; justify-content: center; font-size: 20px;
            overflow: hidden; border: 2px solid rgba(255,255,255,0.3); flex-shrink: 0;
        }
        .sra-header-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .sra-header-title { font-size: 15px; font-weight: 700; color: inherit; line-height: 1.2; }
        .sra-header-sub { font-size: 11px; color: inherit; opacity: 0.88; display: flex; align-items: center; gap: 5px; margin-top: 2px; }
        .sra-dot-active { width: 6px; height: 6px; border-radius: 50%; background: #10B981; }

        .sra-close-btn {
            background: none; border: none; color: inherit; opacity: 0.85;
            cursor: pointer; padding: 6px; border-radius: 50%;
            transition: background 0.2s, opacity 0.2s; display: flex; align-items: center; justify-content: center;
        }
        .sra-close-btn:hover { background: rgba(255,255,255,0.15); opacity: 1; }

        /* Body & Messages */
        .sra-chat-body {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
            background: var(--sra-bg, #0f172a);
            scroll-behavior: smooth;
        }
        .sra-chat-body::-webkit-scrollbar { width: 5px; }
        .sra-chat-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }

        /* Pre-Chat Lead Form Modal */
        .sra-prechat-card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 16px;
            padding: 18px 20px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 12px;
            color: inherit;
        }
        .sra-prechat-title { font-size: 14px; font-weight: 700; color: inherit; }
        .sra-prechat-sub { font-size: 12px; opacity: 0.8; }
        .sra-field-group { display: flex; flex-direction: column; gap: 4px; }
        .sra-field-label { font-size: 11px; opacity: 0.85; font-weight: 600; }
        .sra-field-input {
            background: rgba(0, 0, 0, 0.2) !important;
            border: 1px solid rgba(255, 255, 255, 0.18) !important;
            border-radius: 10px !important;
            padding: 10px 14px !important;
            color: inherit !important;
            font-size: 13px !important;
            outline: none !important;
            box-sizing: border-box !important;
            width: 100% !important;
            transition: all 0.2s ease !important;
        }
        .sra-field-input:focus {
            border-color: var(--sra-primary, #8B5CF6) !important;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25) !important;
        }
        .sra-field-input::placeholder {
            color: inherit !important;
            opacity: 0.5 !important;
            font-size: 12.5px !important;
        }
        .sra-start-btn {
            background: var(--sra-primary, #8B5CF6);
            color: #ffffff;
            border: none;
            border-radius: 10px;
            padding: 10px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            margin-top: 6px;
            transition: opacity 0.2s, transform 0.1s;
        }
        .sra-start-btn:hover { opacity: 0.92; transform: translateY(-1px); }
        .sra-skip-link {
            text-align: center;
            font-size: 11px;
            opacity: 0.65;
            cursor: pointer;
            text-decoration: underline;
        }
        .sra-skip-link:hover { opacity: 0.95; }

        /* Bubbles */
        .sra-msg-group { display: flex; flex-direction: column; max-width: 84%; }
        .sra-msg-group.incoming { align-self: flex-start; }
        .sra-msg-group.outgoing { align-self: flex-end; }

        .sra-msg-bubble {
            padding: 12px 15px;
            border-radius: 16px;
            font-size: 13.5px;
            line-height: 1.5;
            word-break: break-word;
            overflow-wrap: break-word;
            white-space: pre-wrap;
            position: relative;
        }
        .sra-msg-group.incoming .sra-msg-bubble {
            background: rgba(255,255,255,0.08);
            color: inherit;
            border-bottom-left-radius: 4px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .sra-msg-group.outgoing .sra-msg-bubble {
            background: var(--sra-primary, #8B5CF6);
            color: #ffffff;
            border-bottom-right-radius: 4px;
        }
        .sra-msg-time {
            font-size: 10px;
            opacity: 0.6;
            margin-top: 4px;
            padding: 0 4px;
        }
        .sra-msg-group.outgoing .sra-msg-time { text-align: right; }

        /* Image Message Card */
        .sra-msg-image-card {
            border-radius: 14px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
            max-width: 260px;
            width: 100%;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            display: flex;
            flex-direction: column;
        }
        .sra-msg-group.incoming .sra-msg-image-card {
            border-bottom-left-radius: 4px;
        }
        .sra-msg-group.outgoing .sra-msg-image-card {
            border-bottom-right-radius: 4px;
        }
        .sra-msg-image-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 22px rgba(0, 0, 0, 0.4);
        }
        .sra-msg-img-wrap {
            position: relative;
            width: 100%;
            background: rgba(0, 0, 0, 0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 120px;
            max-height: 220px;
            overflow: hidden;
        }
        .sra-msg-img-wrap img {
            width: 100%;
            height: 100%;
            max-height: 220px;
            object-fit: cover;
            display: block;
        }
        .sra-msg-image-caption {
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 500;
            line-height: 1.35;
            color: inherit;
            background: rgba(0, 0, 0, 0.35);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            gap: 6px;
            word-break: break-word;
        }
        .sra-msg-image-caption svg {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
            opacity: 0.8;
            fill: currentColor;
        }

        /* Typing Indicator */
        .sra-typing-row {
            align-self: flex-start;
            background: rgba(255,255,255,0.08);
            padding: 10px 14px;
            border-radius: 16px;
            border-bottom-left-radius: 4px;
            display: none;
            align-items: center;
            gap: 4px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .sra-typing-row.show { display: flex; }
        .sra-typing-dot {
            width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.7;
            animation: sraBounce 1.2s infinite ease-in-out;
        }
        .sra-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .sra-typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes sraBounce { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }

        /* Footer / Input Bar */
        .sra-chat-footer {
            padding: 10px 12px;
            background: var(--sra-bg, #0f172a);
            border-top: 1px solid rgba(255,255,255,0.08);
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
            position: relative;
        }
        .sra-footer-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }
        .sra-action-btn {
            width: 36px; height: 36px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.08);
            color: inherit;
            opacity: 0.85;
            border: 1px solid rgba(255, 255, 255, 0.12);
            cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s ease;
            flex-shrink: 0;
            padding: 0;
        }
        .sra-action-btn:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.16);
            transform: scale(1.05);
        }
        .sra-action-btn svg { width: 17px; height: 17px; fill: currentColor; }
        .sra-action-btn.active-rec {
            background: #ef4444 !important;
            color: #ffffff !important;
            animation: sraRecPulse 1.2s infinite ease-in-out;
        }
        @keyframes sraRecPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
            50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
        }
        .sra-input-wrap {
            flex: 1;
            position: relative;
            display: flex;
            align-items: center;
            min-width: 0;
        }
        .sra-attached-preview {
            position: absolute;
            bottom: calc(100% + 8px);
            left: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            background: #1e293b;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 10px;
            padding: 5px 8px;
            box-shadow: 0 6px 16px rgba(0,0,0,0.4);
            z-index: 20;
        }
        .sra-attached-preview img {
            width: 36px; height: 36px; object-fit: cover; border-radius: 6px; display: block;
        }
        .sra-attached-remove {
            background: #ef4444; color: #fff; border: none; border-radius: 50%;
            width: 18px; height: 18px; font-size: 11px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            line-height: 1;
        }
        .sra-voice-recording-bar {
            position: absolute;
            inset: 0;
            z-index: 5;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 12px;
            background: rgba(239, 68, 68, 0.09);
            border: 1.5px solid rgba(239, 68, 68, 0.4);
            border-radius: 22px;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            box-sizing: border-box;
            animation: sraRecFadeIn 0.2s ease-out;
        }
        @keyframes sraRecFadeIn {
            from { opacity: 0; transform: scale(0.97); }
            to { opacity: 1; transform: scale(1); }
        }
        .sra-rec-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }
        .sra-rec-pulse {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #ef4444;
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
            animation: sraDotRipple 1.4s infinite cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
        }
        @keyframes sraDotRipple {
            0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
            100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .sra-rec-waves {
            display: flex;
            align-items: center;
            gap: 2.5px;
            height: 18px;
        }
        .sra-wave-bar {
            width: 2.5px;
            height: 5px;
            background: #ef4444;
            border-radius: 2px;
            animation: sraWaveMotion 1.1s ease-in-out infinite;
        }
        .sra-wave-bar:nth-child(1) { animation-delay: 0.0s; height: 6px; }
        .sra-wave-bar:nth-child(2) { animation-delay: 0.2s; height: 12px; }
        .sra-wave-bar:nth-child(3) { animation-delay: 0.4s; height: 16px; }
        .sra-wave-bar:nth-child(4) { animation-delay: 0.15s; height: 10px; }
        .sra-wave-bar:nth-child(5) { animation-delay: 0.35s; height: 7px; }

        @keyframes sraWaveMotion {
            0%, 100% { transform: scaleY(0.35); opacity: 0.55; }
            50% { transform: scaleY(1.3); opacity: 1; }
        }
        .sra-rec-time {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 13.5px;
            font-weight: 700;
            color: #ef4444;
            letter-spacing: 0.5px;
            user-select: none;
        }
        .sra-rec-cancel {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(239, 68, 68, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.25);
            border-radius: 14px;
            padding: 4px 10px;
            color: #ef4444;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
            flex-shrink: 0;
            line-height: 1;
        }
        .sra-rec-cancel svg {
            width: 12px;
            height: 12px;
            fill: currentColor;
        }
        .sra-rec-cancel:hover {
            background: rgba(239, 68, 68, 0.22);
            border-color: rgba(239, 68, 68, 0.5);
            transform: scale(1.03);
        }
        .sra-rec-cancel:active {
            transform: scale(0.97);
        }
        .sra-chat-input {
            width: 100%;
            background: rgba(255,255,255,0.07);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 20px;
            padding: 10px 14px;
            color: inherit;
            font-size: 13.5px;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .sra-chat-input:focus {
            border-color: var(--sra-primary, #8B5CF6);
            box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
        }
        .sra-chat-input::placeholder { color: inherit; opacity: 0.5; }

        .sra-send-btn {
            width: 38px; height: 38px;
            border-radius: 50%;
            background: var(--sra-primary, #8B5CF6);
            color: #ffffff;
            border: none;
            cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
            flex-shrink: 0;
            padding: 0;
        }
        .sra-send-btn:hover { opacity: 0.9; transform: scale(1.05); }
        .sra-send-btn svg { width: 17px; height: 17px; fill: currentColor; }

        /* Audio Message Card */
        .sra-audio-card {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            min-width: 200px;
            max-width: 280px;
        }
        .sra-msg-group.outgoing .sra-audio-card {
            background: var(--sra-primary, #8B5CF6);
            color: #ffffff;
            border-bottom-right-radius: 4px;
        }
        .sra-msg-group.incoming .sra-audio-card {
            border-bottom-left-radius: 4px;
        }
        .sra-audio-play-btn {
            width: 34px; height: 34px; border-radius: 50%;
            background: rgba(255,255,255,0.22); border: none;
            color: inherit; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            transition: transform 0.15s ease, background 0.15s ease;
        }
        .sra-audio-play-btn:hover {
            transform: scale(1.08);
            background: rgba(255,255,255,0.32);
        }
        .sra-audio-play-btn svg { width: 14px; height: 14px; fill: currentColor; }
        .sra-audio-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
        .sra-audio-progress-bar {
            width: 100%; height: 5px; background: rgba(255,255,255,0.2);
            border-radius: 3px; overflow: hidden; cursor: pointer;
        }
        .sra-audio-progress-fill {
            width: 0%; height: 100%; background: currentColor;
            transition: width 0.1s linear;
        }
        .sra-audio-time { font-size: 10.5px; opacity: 0.8; font-variant-numeric: tabular-nums; }

        /* Footer Branding */
        .sra-branding {
            text-align: center;
            padding: 6px 10px;
            background: var(--sra-bg, #0f172a);
            font-size: 10px;
            opacity: 0.65;
            border-top: 1px solid rgba(255,255,255,0.04);
            flex-shrink: 0;
        }
        .sra-branding a { color: inherit; text-decoration: none; font-weight: 700; opacity: 0.9; }
        .sra-branding a:hover { text-decoration: underline; }

        @media (max-width: 480px) {
            .sra-widget-wrapper { bottom: 16px; right: 16px; }
            .sra-widget-wrapper.sra-mobile-open {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100% !important;
                height: var(--sra-vvh, 100%) !important;
                z-index: 9999999 !important;
                overflow: hidden !important;
                pointer-events: none;
            }
            .sra-widget-wrapper.sra-mobile-open .sra-widget-btn {
                display: none !important;
            }
            .sra-chat-box {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: auto !important;
                width: 100% !important;
                height: 100% !important;
                height: var(--sra-vvh, 100%) !important;
                max-width: 100% !important;
                max-height: 100% !important;
                max-height: var(--sra-vvh, 100%) !important;
                border-radius: 0 !important;
                z-index: 9999999 !important;
                transform: none !important;
                box-shadow: none !important;
                display: flex !important;
                flex-direction: column !important;
                transition: opacity 0.2s ease;
            }
            .sra-chat-box:not(.open) {
                display: none !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
            .sra-chat-box.open {
                display: flex !important;
                opacity: 1 !important;
                pointer-events: auto !important;
            }
            .sra-chat-header {
                position: sticky !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                z-index: 30 !important;
                flex-shrink: 0 !important;
                padding-top: max(14px, env(safe-area-inset-top, 14px)) !important;
            }
            .sra-chat-body {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow-y: auto !important;
                -webkit-overflow-scrolling: touch !important;
                overscroll-behavior: contain !important;
            }
            .sra-chat-footer {
                flex-shrink: 0 !important;
                padding-bottom: max(12px, env(safe-area-inset-bottom, 12px)) !important;
            }
            .sra-branding {
                flex-shrink: 0 !important;
            }
            .sra-chat-input,
            .sra-field-input {
                font-size: 16px !important; /* Prevents auto-zoom in iOS Safari */
            }
            .sra-voice-recording-bar {
                padding: 0 8px !important;
            }
            .sra-rec-time {
                font-size: 12px !important;
            }
            .sra-rec-cancel {
                padding: 3px 8px !important;
                font-size: 11px !important;
            }
        }
        `;
        document.head.appendChild(styleEl);

        // Build DOM Elements with Clean SVG Icons
        container = document.createElement('div');
        container.className = 'sra-widget-wrapper';
        container.innerHTML = `
            <button class="sra-widget-btn" id="sraWidgetToggle" aria-label="Open Chat">
                <span class="sra-widget-badge-pulse"></span>
                <svg id="sraIconOpen" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
                <svg id="sraIconClose" viewBox="0 0 24 24" style="display:none;"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>

            <div class="sra-chat-box" id="sraChatBox">
                <div class="sra-chat-header">
                    <div class="sra-header-info">
                        <div class="sra-header-avatar" id="sraHeaderAvatar">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
                        </div>
                        <div>
                            <div class="sra-header-title" id="sraHeaderTitle">Customer Support</div>
                            <div class="sra-header-sub" id="sraHeaderSub"><span class="sra-dot-active"></span> Online · AI Powered</div>
                        </div>
                    </div>
                    <button class="sra-close-btn" id="sraCloseBtn" aria-label="Close Chat">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                </div>

                <div class="sra-chat-body" id="sraChatBody">
                    <div class="sra-typing-row" id="sraTypingRow">
                        <span class="sra-typing-dot"></span>
                        <span class="sra-typing-dot"></span>
                        <span class="sra-typing-dot"></span>
                    </div>
                </div>

                <div class="sra-chat-footer">
                    <div class="sra-footer-actions">
                        <button class="sra-action-btn" id="sraAttachBtn" type="button" aria-label="Send Image" title="Send Image">
                            <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                        </button>
                        <input type="file" id="sraFileInput" accept="image/*" style="display:none;">

                        <button class="sra-action-btn" id="sraMicBtn" type="button" aria-label="Record Voice" title="Record Voice">
                            <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
                        </button>
                    </div>

                    <div class="sra-input-wrap">
                        <div class="sra-attached-preview" id="sraAttachedPreview" style="display:none;">
                            <img id="sraAttachedThumb" src="" alt="attachment">
                            <button type="button" class="sra-attached-remove" id="sraAttachedRemove" title="Remove">&times;</button>
                        </div>

                        <div class="sra-voice-recording-bar" id="sraVoiceRecordingBar" style="display:none;">
                            <div class="sra-rec-indicator">
                                <span class="sra-rec-pulse"></span>
                                <div class="sra-rec-waves" aria-hidden="true">
                                    <span class="sra-wave-bar"></span>
                                    <span class="sra-wave-bar"></span>
                                    <span class="sra-wave-bar"></span>
                                    <span class="sra-wave-bar"></span>
                                    <span class="sra-wave-bar"></span>
                                </div>
                                <span class="sra-rec-time" id="sraRecTime">00:00</span>
                            </div>
                            <button type="button" class="sra-rec-cancel" id="sraRecCancel" title="Cancel Recording">
                                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                <span>Cancel</span>
                            </button>
                        </div>

                        <input type="text" class="sra-chat-input" id="sraInput" placeholder="Type your message..." autocomplete="off">
                    </div>

                    <button class="sra-send-btn" id="sraSendBtn" aria-label="Send Message">
                        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
                <div class="sra-branding" id="sraBranding">⚡ Powered by <a href="${baseUrl}" target="_blank">Sales Reply AI</a></div>
            </div>
        `;
        document.body.appendChild(container);

        // Bind DOM references
        toggleBtn = document.getElementById('sraWidgetToggle');
        closeBtn = document.getElementById('sraCloseBtn');
        chatBox = document.getElementById('sraChatBox');
        chatBody = document.getElementById('sraChatBody');
        chatInput = document.getElementById('sraInput');
        sendBtn = document.getElementById('sraSendBtn');
        attachBtn = document.getElementById('sraAttachBtn');
        fileInput = document.getElementById('sraFileInput');
        micBtn = document.getElementById('sraMicBtn');
        previewBox = document.getElementById('sraAttachedPreview');
        previewThumb = document.getElementById('sraAttachedThumb');
        removeAttachBtn = document.getElementById('sraAttachedRemove');
        recBar = document.getElementById('sraVoiceRecordingBar');
        recTimeEl = document.getElementById('sraRecTime');
        recCancelBtn = document.getElementById('sraRecCancel');
        iconOpen = document.getElementById('sraIconOpen');
        iconClose = document.getElementById('sraIconClose');
        typingRow = document.getElementById('sraTypingRow');
        brandingEl = document.getElementById('sraBranding');

        // Mobile Viewport & Resizing Handlers
        ensureInteractiveWidgetMeta();

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleViewportChange);
            window.visualViewport.addEventListener('scroll', handleViewportChange);
        }
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('orientationchange', function () {
            setTimeout(handleViewportChange, 150);
        });

        // Keep header locked and scroll bottom when any input inside widget gains/loses focus
        container.addEventListener('focusin', function (e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                handleViewportChange();
                setTimeout(handleViewportChange, 80);
                setTimeout(handleViewportChange, 250);
            }
        });
        container.addEventListener('focusout', function (e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                handleViewportChange();
                setTimeout(handleViewportChange, 120);
            }
        });

        // Bind Event Listeners
        toggleBtn.addEventListener('click', toggleChat);
        closeBtn.addEventListener('click', toggleChat);
        sendBtn.addEventListener('click', function () {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopRecording(true);
            } else {
                sendMessage();
            }
        });
        chatInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', function () {
                fileInput.click();
            });
            fileInput.addEventListener('change', function () {
                if (fileInput.files && fileInput.files[0]) {
                    handleSelectedImage(fileInput.files[0]);
                }
            });
        }

        if (removeAttachBtn) {
            removeAttachBtn.addEventListener('click', function () {
                clearPendingImage();
            });
        }

        if (micBtn) {
            micBtn.addEventListener('click', function () {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    stopRecording(true);
                } else {
                    startRecording();
                }
            });
        }

        if (recCancelBtn) {
            recCancelBtn.addEventListener('click', function () {
                stopRecording(false);
            });
        }

        // Apply config & fetch history
        applyConfig();
        loadHistory();
    }

    // Media & Voice Helpers
    function handleSelectedImage(file) {
        if (!file) return;
        pendingImageFile = file;
        if (previewThumb) {
            previewThumb.src = URL.createObjectURL(file);
        }
        if (previewBox) {
            previewBox.style.display = 'flex';
        }
    }

    function clearPendingImage() {
        pendingImageFile = null;
        if (fileInput) fileInput.value = '';
        if (previewThumb && previewThumb.src && previewThumb.src.indexOf('blob:') === 0) {
            try { URL.revokeObjectURL(previewThumb.src); } catch(e){}
            previewThumb.src = '';
        }
        if (previewBox) {
            previewBox.style.display = 'none';
        }
    }

    function startRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Audio recording is not supported in this browser.');
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (stream) {
                audioChunks = [];
                var options = {};
                if (typeof MediaRecorder.isTypeSupported === 'function') {
                    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                        options = { mimeType: 'audio/webm;codecs=opus' };
                    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                        options = { mimeType: 'audio/mp4' };
                    }
                }

                try {
                    mediaRecorder = new MediaRecorder(stream, options);
                } catch(e) {
                    mediaRecorder = new MediaRecorder(stream);
                }

                mediaRecorder.ondataavailable = function (e) {
                    if (e.data && e.data.size > 0) {
                        audioChunks.push(e.data);
                    }
                };

                mediaRecorder.start();

                recSeconds = 0;
                if (recTimeEl) recTimeEl.innerText = '00:00';
                if (recBar) recBar.style.display = 'flex';
                if (chatInput) chatInput.style.visibility = 'hidden';
                if (micBtn) micBtn.classList.add('active-rec');

                if (recTimer) clearInterval(recTimer);
                recTimer = setInterval(function () {
                    recSeconds++;
                    var m = Math.floor(recSeconds / 60);
                    var s = recSeconds % 60;
                    if (recTimeEl) {
                        recTimeEl.innerText = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
                    }
                }, 1000);
            })
            .catch(function (err) {
                console.warn('[Sales Reply AI Widget Mic Error]', err);
                alert('Microphone access was denied or is unavailable.');
            });
    }

    function stopRecording(sendAfter) {
        var recordedDuration = recSeconds;
        if (recTimer) {
            clearInterval(recTimer);
            recTimer = null;
        }
        if (recBar) recBar.style.display = 'none';
        if (chatInput) chatInput.style.visibility = 'visible';
        if (micBtn) micBtn.classList.remove('active-rec');

        if (!mediaRecorder) return;

        if (mediaRecorder.state === 'recording') {
            mediaRecorder.onstop = function () {
                var stream = mediaRecorder ? mediaRecorder.stream : null;
                if (stream) {
                    stream.getTracks().forEach(function (t) { t.stop(); });
                }

                if (sendAfter && audioChunks.length > 0) {
                    var mime = (mediaRecorder && mediaRecorder.mimeType) ? mediaRecorder.mimeType : 'audio/webm';
                    pendingAudioBlob = new Blob(audioChunks, { type: mime });
                    pendingAudioDuration = recordedDuration || 0;
                    sendMessage();
                }
                audioChunks = [];
            };
            try {
                mediaRecorder.stop();
            } catch(e) {}
        }
    }

    // 3. API Communication Logic & Initialization
    function initWidget() {
        fetch(baseUrl + '/api/widget/init?token=' + encodeURIComponent(widgetToken))
            .then(function (res) {
                if (!res.ok) {
                    throw new Error('Widget token verification failed (' + res.status + ')');
                }
                return res.json();
            })
            .then(function (data) {
                if (data && data.status === 'success' && data.config) {
                    config = Object.assign(config, data.config);
                    if (document.body) {
                        mountWidget();
                    } else {
                        document.addEventListener('DOMContentLoaded', mountWidget);
                    }
                } else {
                    console.warn('[Sales Reply AI Widget]', data ? data.message : 'Inactive or unauthorized');
                }
            })
            .catch(function (err) {
                console.warn('[Sales Reply AI Widget]', err.message || err);
            });
    }

    function applyConfig() {
        if (config.primaryColor) {
            container.style.setProperty('--sra-primary', config.primaryColor);
        }
        if (config.bgColor) {
            container.style.setProperty('--sra-bg', config.bgColor);
            chatBox.style.background = config.bgColor;
            chatBody.style.background = config.bgColor;
            var footerEl = container.querySelector('.sra-chat-footer');
            if (footerEl) footerEl.style.background = config.bgColor;
            if (brandingEl) brandingEl.style.background = config.bgColor;
        }
        if (config.headerBg) {
            container.style.setProperty('--sra-header-bg', config.headerBg);
            var headerEl = container.querySelector('.sra-chat-header');
            if (headerEl) headerEl.style.background = config.headerBg;
        }
        if (config.textColor) {
            container.style.setProperty('--sra-text', config.textColor);
            chatBox.style.color = config.textColor;
        }
        if (config.headerTextColor) {
            container.style.setProperty('--sra-header-text', config.headerTextColor);
            var titleEl = document.getElementById('sraHeaderTitle');
            var subEl = document.getElementById('sraHeaderSub');
            if (titleEl) titleEl.style.color = config.headerTextColor;
            if (subEl) subEl.style.color = config.headerTextColor;
        }
        if (config.widgetTitle) {
            document.getElementById('sraHeaderTitle').innerText = config.widgetTitle;
        }
        if (config.agentName) {
            document.getElementById('sraHeaderSub').innerHTML = '<span class="sra-dot-active"></span> ' + config.agentName + ' · Online';
        }
        if (config.botAvatar) {
            document.getElementById('sraHeaderAvatar').innerHTML = '<img src="' + config.botAvatar + '" alt="Avatar">';
        }
        if (config.hideBranding) {
            brandingEl.style.display = 'none';
        } else if (config.customBrandingText) {
            brandingEl.innerHTML = '⚡ Powered by ' + config.customBrandingText;
        }

        if (attachBtn) {
            attachBtn.style.display = (config.allowImageUpload !== false) ? 'flex' : 'none';
        }
        if (micBtn) {
            micBtn.style.display = (config.allowVoiceRecord !== false) ? 'flex' : 'none';
        }
    }

    function loadHistory() {
        fetch(baseUrl + '/api/widget/history?token=' + encodeURIComponent(widgetToken) + '&visitor_id=' + encodeURIComponent(visitorId))
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.status === 'success') {
                    if (data.contact) {
                        if (data.contact.name) visitorName = data.contact.name;
                        if (data.contact.phone) visitorPhone = data.contact.phone;
                        if (data.contact.email) visitorEmail = data.contact.email;
                        if (visitorName || visitorPhone) isPrechatSubmitted = true;
                    }
                    renderMessages(data.messages || []);
                }
            });
    }

    var renderedMsgIds = {};
    var hasInitializedChat = false;
    var isSending = false;

    function formatImageUrl(url) {
        if (!url || typeof url !== 'string') return '';
        var trimmed = url.trim();
        if (trimmed.indexOf('blob:') === 0 || trimmed.indexOf('data:') === 0) {
            return trimmed;
        }
        if (trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0 || trimmed.indexOf('//') === 0) {
            return trimmed;
        }
        return baseUrl + '/' + trimmed.replace(/^\/+/, '');
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.innerText = text || '';
        return div.innerHTML;
    }

    function renderMessages(msgs) {
        if (config.prechatMode === 'required') {
            var needName = config.prechatAskName && !visitorName;
            var needPhone = config.prechatAskPhone && !visitorPhone;
            if (needName || needPhone) {
                isPrechatSubmitted = false;
            }
        }

        // Pre-chat form check
        if (!isPrechatSubmitted && config.prechatMode !== 'disabled') {
            // If pre-chat form is ALREADY rendered on screen, DO NOT wipe/re-render to prevent input reset while typing!
            if (document.getElementById('inputName') || document.getElementById('inputPhone') || document.getElementById('inputEmail')) {
                return;
            }
            chatBody.innerHTML = '';
            chatBody.appendChild(typingRow);
            renderPrechatForm();
            return;
        }

        var incomingMsgs = msgs || [];

        // First initial load or after prechat form submission
        if (!hasInitializedChat) {
            chatBody.innerHTML = '';
            chatBody.appendChild(typingRow);
            renderedMsgIds = {};

            if (incomingMsgs.length === 0 && config.welcomeMessage) {
                appendBubble('incoming', config.welcomeMessage, new Date(), 'welcome_msg');
            } else {
                incomingMsgs.forEach(function (m) {
                    renderSingleMessage(m);
                });
            }
            hasInitializedChat = true;
            scrollToBottom();
            return;
        }

        // Subsequent poll updates: Only append messages whose IDs have not been rendered yet!
        var hasNew = false;
        incomingMsgs.forEach(function (m) {
            var idKey = m.id ? ('id_' + m.id) : null;
            if (idKey && renderedMsgIds[idKey]) {
                return; // Already rendered, skip duplicate!
            }
            renderSingleMessage(m);
            hasNew = true;
        });

        if (hasNew) {
            scrollToBottom();
        }
    }

    function renderSingleMessage(m) {
        var idKey = m.id ? ('id_' + m.id) : null;
        if (idKey) {
            renderedMsgIds[idKey] = true;
        }

        var bubbleType = (m.direction === 'outgoing') ? 'incoming' : 'outgoing';
        var isAudioType = (m.message_type === 'audio' || m.message_type === 'voice');
        var cleanUrl = (m.media_url || '').split('?')[0].toLowerCase();
        var isAudioExt = /\.(mp3|wav|ogg|m4a|aac|opus|webm)$/i.test(cleanUrl) || cleanUrl.indexOf('wa_voice_') !== -1;

        if (isAudioType || isAudioExt) {
            appendAudioBubble(bubbleType, m.media_url, m.created_at, m.id);
            if (m.content && m.content.indexOf('[Voice Note') === -1 && m.content.indexOf('[Audio') === -1) {
                appendBubble(bubbleType, m.content, m.created_at, m.id ? (m.id + '_txt') : null);
            }
            return;
        }

        var hasMedia = m.media_url && typeof m.media_url === 'string' && m.media_url.trim().length > 0;
        var isImgType = (m.message_type === 'image');
        var isImgContent = m.content && typeof m.content === 'string' && m.content.indexOf('📷 Product Image:') === 0;

        if (hasMedia || isImgType || isImgContent) {
            var imgUrl = m.media_url || '';
            var caption = m.content || '';
            if (caption.indexOf('📷 Product Image:') === 0) {
                caption = caption.replace(/^📷\s*Product Image:\s*/i, '').trim();
            } else if (caption === '[Image]') {
                caption = '';
            }
            appendImageBubble(bubbleType, imgUrl, caption, m.created_at, m.id);
        } else {
            appendBubble(bubbleType, m.content, m.created_at, m.id);
        }
    }

    function renderPrechatForm() {
        var card = document.createElement('div');
        card.className = 'sra-prechat-card';

        var title = document.createElement('div');
        title.className = 'sra-prechat-title';
        title.innerText = 'Welcome! Please enter your details';

        var sub = document.createElement('div');
        sub.className = 'sra-prechat-sub';
        sub.innerText = 'Fill in your info below so we can assist you better.';

        card.appendChild(title);
        card.appendChild(sub);

        if (config.prechatAskName) {
            card.appendChild(createFieldGroup('Your Name', 'text', 'inputName', visitorName, 'e.g. Tanvir Hossain'));
        }
        if (config.prechatAskPhone) {
            card.appendChild(createFieldGroup('Phone Number', 'tel', 'inputPhone', visitorPhone, 'e.g. 01700000000'));
        }
        if (config.prechatAskEmail) {
            card.appendChild(createFieldGroup('Email Address', 'email', 'inputEmail', visitorEmail, 'e.g. name@example.com'));
        }

        var btn = document.createElement('button');
        btn.className = 'sra-start-btn';
        btn.innerText = 'Start Chat →';
        btn.addEventListener('click', submitPrechatForm);
        card.appendChild(btn);

        if (config.prechatMode === 'optional') {
            var skip = document.createElement('div');
            skip.className = 'sra-skip-link';
            skip.innerText = 'Skip & Chat as Guest';
            skip.addEventListener('click', function () {
                isPrechatSubmitted = true;
                hasInitializedChat = false;
                try { localStorage.setItem('sra_prechat_done_' + widgetToken, 'true'); } catch(e){}
                loadHistory();
            });
            card.appendChild(skip);
        }

        chatBody.insertBefore(card, typingRow);
    }

    function createFieldGroup(label, type, id, defaultVal, placeholderText) {
        var g = document.createElement('div');
        g.className = 'sra-field-group';

        var l = document.createElement('label');
        l.className = 'sra-field-label';
        l.innerText = label;

        var inp = document.createElement('input');
        inp.className = 'sra-field-input';
        inp.type = type;
        inp.id = id;
        inp.value = defaultVal || '';
        if (placeholderText) {
            inp.placeholder = placeholderText;
        }

        g.appendChild(l);
        g.appendChild(inp);
        return g;
    }

    function submitPrechatForm() {
        var nameEl = document.getElementById('inputName');
        var phoneEl = document.getElementById('inputPhone');
        var emailEl = document.getElementById('inputEmail');

        visitorName = nameEl ? nameEl.value.trim() : '';
        visitorPhone = phoneEl ? phoneEl.value.trim() : '';
        visitorEmail = emailEl ? emailEl.value.trim() : '';

        if (config.prechatMode === 'required') {
            if (config.prechatAskName && !visitorName) {
                alert('Please enter your name');
                return;
            }
            if (config.prechatAskPhone && !visitorPhone) {
                alert('Please enter your phone number');
                return;
            }
        }

        try {
            localStorage.setItem('sra_vis_name', visitorName);
            localStorage.setItem('sra_vis_phone', visitorPhone);
            localStorage.setItem('sra_vis_email', visitorEmail);
            localStorage.setItem('sra_prechat_done_' + widgetToken, 'true');
        } catch(e) {}

        isPrechatSubmitted = true;
        hasInitializedChat = false;
        loadHistory();
    }

    function appendBubble(type, content, timeStr, msgId) {
        if (msgId) {
            renderedMsgIds['id_' + msgId] = true;
        }

        var group = document.createElement('div');
        group.className = 'sra-msg-group ' + type;
        if (msgId) group.setAttribute('data-msg-id', msgId);

        var bubble = document.createElement('div');
        bubble.className = 'sra-msg-bubble';
        bubble.innerText = content || '';

        var timeEl = document.createElement('div');
        timeEl.className = 'sra-msg-time';
        var d = timeStr ? new Date(timeStr) : new Date();
        timeEl.innerText = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        group.appendChild(bubble);
        group.appendChild(timeEl);

        chatBody.insertBefore(group, typingRow);
        scrollToBottom();
    }

    function appendImageBubble(type, rawUrl, caption, timeStr, msgId) {
        if (msgId) {
            renderedMsgIds['id_' + msgId] = true;
        }

        var fullUrl = formatImageUrl(rawUrl);

        // Fallback to text bubble if no image url could be found
        if (!fullUrl) {
            appendBubble(type, caption ? ('📷 ' + caption) : '📷 Product Image', timeStr, msgId);
            return;
        }

        var group = document.createElement('div');
        group.className = 'sra-msg-group ' + type;
        if (msgId) group.setAttribute('data-msg-id', msgId);

        var card = document.createElement('div');
        card.className = 'sra-msg-image-card';
        card.title = 'Click to view full image';

        var imgWrap = document.createElement('div');
        imgWrap.className = 'sra-msg-img-wrap';

        var img = document.createElement('img');
        img.src = fullUrl;
        img.alt = caption || 'Product Image';
        img.loading = 'lazy';
        img.onerror = function () {
            imgWrap.innerHTML = '<div style="padding: 20px 14px; font-size: 11.5px; opacity: 0.75; text-align: center;">📷 Image preview unavailable</div>';
        };
        imgWrap.appendChild(img);
        card.appendChild(imgWrap);

        if (caption) {
            var capEl = document.createElement('div');
            capEl.className = 'sra-msg-image-caption';
            capEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg><span>' + escapeHtml(caption) + '</span>';
            card.appendChild(capEl);
        }

        card.addEventListener('click', function () {
            window.open(fullUrl, '_blank');
        });

        var timeEl = document.createElement('div');
        timeEl.className = 'sra-msg-time';
        var d = timeStr ? new Date(timeStr) : new Date();
        timeEl.innerText = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        group.appendChild(card);
        group.appendChild(timeEl);

        chatBody.insertBefore(group, typingRow);
        scrollToBottom();
    }

    function appendAudioBubble(type, rawUrl, timeStr, msgId, initialDuration) {
        if (msgId) {
            renderedMsgIds['id_' + msgId] = true;
        }

        var fullUrl = formatImageUrl(rawUrl);
        if (!fullUrl) return;

        var group = document.createElement('div');
        group.className = 'sra-msg-group ' + type;
        if (msgId) group.setAttribute('data-msg-id', msgId);

        var card = document.createElement('div');
        card.className = 'sra-audio-card';

        var audio = new Audio(fullUrl);
        audio.preload = 'metadata';

        var playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'sra-audio-play-btn';
        playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

        var info = document.createElement('div');
        info.className = 'sra-audio-info';

        var progBar = document.createElement('div');
        progBar.className = 'sra-audio-progress-bar';

        var progFill = document.createElement('div');
        progFill.className = 'sra-audio-progress-fill';
        progBar.appendChild(progFill);

        var timeEl = document.createElement('div');
        timeEl.className = 'sra-audio-time';
        var initSec = (typeof initialDuration === 'number' && initialDuration > 0) ? Math.round(initialDuration) : 0;
        if (initSec > 0) {
            var im = Math.floor(initSec / 60);
            var isec = Math.floor(initSec % 60);
            timeEl.innerText = im + ':' + (isec < 10 ? '0' : '') + isec;
        } else {
            timeEl.innerText = '0:00';
        }

        info.appendChild(progBar);
        info.appendChild(timeEl);

        function getEffectiveDuration() {
            if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
                return audio.duration;
            }
            return initSec > 0 ? initSec : 0;
        }

        audio.addEventListener('loadedmetadata', function () {
            var dur = getEffectiveDuration();
            if (dur > 0) {
                var m = Math.floor(dur / 60);
                var s = Math.floor(dur % 60);
                timeEl.innerText = m + ':' + (s < 10 ? '0' : '') + s;
            }
        });

        audio.addEventListener('timeupdate', function () {
            var dur = getEffectiveDuration();
            if (dur > 0) {
                var p = (audio.currentTime / dur) * 100;
                progFill.style.width = Math.min(100, p) + '%';
                var rem = Math.max(0, Math.floor(dur - audio.currentTime));
                var m = Math.floor(rem / 60);
                var s = Math.floor(rem % 60);
                timeEl.innerText = m + ':' + (s < 10 ? '0' : '') + s;
            }
        });

        audio.addEventListener('ended', function () {
            playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            progFill.style.width = '0%';
            var dur = getEffectiveDuration();
            if (dur > 0) {
                var m = Math.floor(dur / 60);
                var s = Math.floor(dur % 60);
                timeEl.innerText = m + ':' + (s < 10 ? '0' : '') + s;
            }
        });

        playBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (audio.paused) {
                var playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(function () {
                        playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
                    }).catch(function (err) {
                        console.warn('[Sales Reply AI Widget] Audio play failed:', err);
                    });
                } else {
                    playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
                }
            } else {
                audio.pause();
                playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            }
        });

        progBar.addEventListener('click', function (e) {
            var dur = getEffectiveDuration();
            if (dur > 0) {
                var rect = progBar.getBoundingClientRect();
                var pos = (e.clientX - rect.left) / rect.width;
                audio.currentTime = Math.max(0, Math.min(1, pos)) * dur;
            }
        });

        card.appendChild(playBtn);
        card.appendChild(info);

        var msgTime = document.createElement('div');
        msgTime.className = 'sra-msg-time';
        var d = timeStr ? new Date(timeStr) : new Date();
        msgTime.innerText = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        group.appendChild(card);
        group.appendChild(msgTime);

        chatBody.insertBefore(group, typingRow);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function sendMessage() {
        var text = chatInput.value.trim();
        var imgToSend = pendingImageFile;
        var audioToSend = pendingAudioBlob;
        var durationToSend = pendingAudioDuration || 0;

        if (!text && !imgToSend && !audioToSend) return;
        if (isSending) return;

        if (!isPrechatSubmitted && config.prechatMode === 'required') {
            alert('Please submit your contact info first.');
            return;
        }

        isSending = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.pointerEvents = 'none';

        chatInput.value = '';
        var clientMsgId = 'client_' + Date.now();

        // Render outgoing image preview if present
        if (imgToSend) {
            var localImgUrl = URL.createObjectURL(imgToSend);
            appendImageBubble('outgoing', localImgUrl, '', new Date(), clientMsgId + '_img');
            clearPendingImage();
        }

        // Render outgoing voice note preview if present
        if (audioToSend) {
            var localAudioUrl = URL.createObjectURL(audioToSend);
            appendAudioBubble('outgoing', localAudioUrl, new Date(), clientMsgId + '_aud', durationToSend);
            pendingAudioBlob = null;
            pendingAudioDuration = 0;
        }

        // Render outgoing text if present
        if (text) {
            appendBubble('outgoing', text, new Date(), clientMsgId);
        }

        var sendStartTime = Date.now();
        typingRow.classList.add('show');
        scrollToBottom();

        var formData = new FormData();
        formData.append('token', widgetToken);
        formData.append('visitor_id', visitorId);
        if (text) formData.append('message', text);
        if (imgToSend) formData.append('image', imgToSend);
        if (audioToSend) {
            var audExt = (audioToSend.type && audioToSend.type.indexOf('mp4') !== -1) ? 'mp4' : 'webm';
            formData.append('audio', audioToSend, 'visitor_voice_' + Date.now() + '.' + audExt);
            formData.append('duration', durationToSend);
        }
        if (visitorName) formData.append('visitor_name', visitorName);
        if (visitorPhone) formData.append('visitor_phone', visitorPhone);
        if (visitorEmail) formData.append('visitor_email', visitorEmail);
        formData.append('current_url', window.location.href);

        fetch(baseUrl + '/api/widget/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json'
            },
            body: formData
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var elapsedSec = (Date.now() - sendStartTime) / 1000;
                var delayTarget = 0;
                if (data && typeof data.reply_delay_enabled !== 'undefined') {
                    if (data.reply_delay_enabled) delayTarget = Number(data.reply_delay_seconds) || 0;
                } else if (config.replyDelayEnabled) {
                    delayTarget = Number(config.replyDelaySeconds) || 0;
                }
                var waitMs = Math.max(0, Math.min(100, delayTarget - elapsedSec) * 1000);

                setTimeout(function () {
                    typingRow.classList.remove('show');
                    isSending = false;
                    sendBtn.style.opacity = '1';
                    sendBtn.style.pointerEvents = 'auto';

                    if (data.status === 'success') {
                        if (data.user_msg_id) {
                            renderedMsgIds['id_' + data.user_msg_id] = true;
                        }

                        // Play / Render incoming audio reply
                        if (data.audio_url) {
                            appendAudioBubble('incoming', data.audio_url, new Date(), data.reply_id ? (data.reply_id + '_aud') : null);
                        }

                        // Text Reply
                        if (data.reply) {
                            if (data.reply_id) {
                                renderedMsgIds['id_' + data.reply_id] = true;
                            }
                            appendBubble('incoming', data.reply, new Date(), data.reply_id);
                        }

                        // Render Product Images
                        var details = data.image_details || [];
                        if (details.length > 0) {
                            details.forEach(function (item) {
                                if (item.id) renderedMsgIds['id_' + item.id] = true;
                                appendImageBubble('incoming', item.url, item.caption, new Date(), item.id);
                            });
                        } else if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                            data.images.forEach(function (imgUrl) {
                                appendImageBubble('incoming', imgUrl, '', new Date());
                            });
                        }
                        scrollToBottom();
                    } else if (data.message) {
                        console.warn('[Sales Reply AI Widget]', data.message);
                    }
                }, waitMs);
            })
            .catch(function (err) {
                typingRow.classList.remove('show');
                isSending = false;
                sendBtn.style.opacity = '1';
                sendBtn.style.pointerEvents = 'auto';
                console.error('[Sales Reply AI Widget Send Error]', err);
            });
    }

    var prevBodyOverflow = '';
    var prevHtmlOverflow = '';

    function ensureInteractiveWidgetMeta() {
        try {
            var meta = document.querySelector('meta[name="viewport"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'viewport';
                meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, interactive-widget=resizes-content';
                document.head.appendChild(meta);
            } else {
                var content = meta.getAttribute('content') || '';
                if (content.indexOf('interactive-widget') === -1) {
                    meta.setAttribute('content', content + ', interactive-widget=resizes-content');
                }
            }
        } catch (e) {}
    }

    function lockMobileScroll() {
        if (window.innerWidth <= 480) {
            prevBodyOverflow = document.body ? document.body.style.overflow : '';
            prevHtmlOverflow = document.documentElement ? document.documentElement.style.overflow : '';
            if (document.body) document.body.style.overflow = 'hidden';
            if (document.documentElement) document.documentElement.style.overflow = 'hidden';
        }
    }

    function unlockMobileScroll() {
        if (window.innerWidth <= 480) {
            if (document.body) document.body.style.overflow = prevBodyOverflow || '';
            if (document.documentElement) document.documentElement.style.overflow = prevHtmlOverflow || '';
        }
    }

    function handleViewportChange() {
        if (!chatBox) return;
        if (!isOpen || window.innerWidth > 480) {
            chatBox.style.height = '';
            chatBox.style.top = '';
            chatBox.style.bottom = '';
            document.documentElement.style.removeProperty('--sra-vvh');
            return;
        }

        var vv = window.visualViewport;
        var h = vv ? vv.height : window.innerHeight;
        var offsetTop = vv ? (vv.offsetTop || 0) : 0;

        document.documentElement.style.setProperty('--sra-vvh', Math.round(h) + 'px');
        chatBox.style.height = Math.round(h) + 'px';
        chatBox.style.top = Math.round(offsetTop) + 'px';
        chatBox.style.bottom = 'auto';

        // Keep page scroll locked at top so header cannot be pushed off-screen
        if (window.scrollY !== 0 || (document.documentElement && document.documentElement.scrollTop !== 0)) {
            window.scrollTo(0, 0);
            if (document.documentElement) document.documentElement.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;
        }

        scrollToBottom();
    }

    // Toggle Window Visibility
    function toggleChat() {
        isOpen = !isOpen;
        if (isOpen) {
            chatBox.classList.add('open');
            container.classList.add('sra-mobile-open');
            iconOpen.style.display = 'none';
            iconClose.style.display = 'block';
            lockMobileScroll();
            handleViewportChange();
            if (window.innerWidth > 480) {
                chatInput.focus();
            }
            scrollToBottom();
            startPolling();
        } else {
            chatBox.classList.remove('open');
            container.classList.remove('sra-mobile-open');
            iconOpen.style.display = 'block';
            iconClose.style.display = 'none';
            unlockMobileScroll();
            handleViewportChange();
            stopPolling();
        }
    }

    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(function () {
            if (isOpen && !isSending) loadHistory();
        }, 5000);
    }

    function stopPolling() {
        if (pollInterval) clearInterval(pollInterval);
    }

    // Start initialization
    initWidget();
})();
