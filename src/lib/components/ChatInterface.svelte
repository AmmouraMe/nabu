<script lang="ts">
	import {
		chatHistoryStore,
		currentMessages,
		type ChatAttachment,
		type MediaAttachment,
		type MessageCost
	} from '$lib/stores/chatHistory';
	import { calculateCost, formatCost, getModelDisplayName } from '$lib/utils/cost';
	import {
		fileToDataUrl,
		formatFileSize,
		getAcceptString,
		getAttachmentType,
		MAX_ATTACHMENTS,
		validateAttachmentFile
	} from '$lib/utils/attachments';
	import { onDestroy, onMount } from 'svelte';
	import { quintOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import VideoCard from './VideoCard.svelte';
	import VoiceButton from './VoiceButton.svelte';

	// Voice/video availability passed from server
	export let voiceAvailable = false;
	export let videoAvailable = false;

	// Model selection
	interface ChatModel {
		id: string;
		displayName: string;
	}
	let availableModels: ChatModel[] = [];
	let availableVideoModels: ChatModel[] = [];
	let selectedModel = 'gpt-4o';
	let selectedVideoModel = '';
	let isLoadingModels = false;
	let showModelSelector = false;

	// Video mode
	let isVideoMode = false;
	let videoAspectRatio: '16:9' | '9:16' | '1:1' = '16:9';

	// Use store-based messages
	$: messages = $currentMessages.map((msg) => ({
		...msg,
		timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)
	}));

	let isLoading = false;
	let streamingContent = '';
	let streamingStatus = '';
	let streamingKeyName = '';

	let input = '';
	let chatContainer: HTMLDivElement;
	let textareaElement: HTMLTextAreaElement;
	let audioContext: AudioContext | null = null;
	let mediaStream: MediaStream | null = null;
	let realtimeWs: WebSocket | null = null;
	let isVoiceActive = false;
	let voiceState: 'idle' | 'listening' | 'processing' | 'speaking' = 'idle';
	let currentUserTranscript = '';
	let currentAssistantId: string | null = null;
	let pendingUserMessageId: string | null = null;
	let isFocused = false;
	let audioQueue: ArrayBuffer[] = [];
	let isPlayingAudio = false;
	let audioProcessor: ScriptProcessorNode | null = null;
	let sessionConfigured = false;

	// Voice session tracking
	let currentVoiceModel = 'gpt-4o-realtime-preview-2024-12-17';
	let voiceSessionUsage: {
		inputTokens: number;
		outputTokens: number;
	} = { inputTokens: 0, outputTokens: 0 };

	// Attachments state
	let pendingAttachments: ChatAttachment[] = [];
	let fileInputElement: HTMLInputElement;
	let isDragOver = false;
	let attachmentError = '';

	// Input state
	const MAX_INPUT_LENGTH = 4000;
	$: inputLength = input.length;
	$: canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !isLoading && !isVoiceActive;
	$: showCharCount = inputLength > MAX_INPUT_LENGTH * 0.8;

	onMount(() => {
		scrollToBottom();
		autoResizeTextarea();
		fetchAvailableModels();
	});

	async function fetchAvailableModels() {
		isLoadingModels = true;
		try {
			const response = await fetch('/api/chat/models');
			if (response.ok) {
				const data = await response.json();
				availableModels = data.models;
				selectedModel = data.defaultModel || 'gpt-4o';
				showModelSelector = availableModels.length > 1;

				// Video models
				if (data.videoModels && data.videoModels.length > 0) {
					availableVideoModels = data.videoModels;
					selectedVideoModel = data.videoModels[0]?.id || '';
				}
			}
		} catch (err) {
			console.error('Failed to fetch models:', err);
		} finally {
			isLoadingModels = false;
		}
	}

	onDestroy(() => {
		if (realtimeWs) {
			realtimeWs.close();
		}
		if (mediaStream) {
			mediaStream.getTracks().forEach((track) => track.stop());
		}
		if (audioProcessor) {
			audioProcessor.disconnect();
		}
		if (audioContext) {
			audioContext.close();
		}
	});

	function scrollToBottom() {
		if (chatContainer && chatContainer.scrollHeight) {
			setTimeout(() => {
				if (chatContainer) {
					chatContainer.scrollTop = chatContainer.scrollHeight;
				}
			}, 100);
		}
	}

	function autoResizeTextarea() {
		if (textareaElement) {
			textareaElement.style.height = 'auto';
			textareaElement.style.height = textareaElement.scrollHeight + 'px';
		}
	}

	async function sendMessage() {
		if (!canSend) return;

		// Ensure we have a current conversation
		let conversationId = $chatHistoryStore.currentConversationId;
		if (!conversationId) {
			const conv = await chatHistoryStore.createConversation();
			conversationId = conv.id;
		}

		const messageContent = input.trim();

		// Check if we're in video mode
		if (isVideoMode && videoAvailable) {
			await sendVideoGeneration(conversationId, messageContent);
			return;
		}

		// Capture current attachments and clear them
		const messageAttachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;

		// Add user message to store with the selected model
		const userCost: MessageCost = {
			inputTokens: 0,
			outputTokens: 0,
			totalCost: 0,
			model: selectedModel,
			displayName: getModelDisplayName(selectedModel)
		};
		chatHistoryStore.addMessage(conversationId, {
			role: 'user',
			content: messageContent || (messageAttachments ? `[${messageAttachments.length} attachment${messageAttachments.length > 1 ? 's' : ''}]` : ''),
			cost: userCost,
			attachments: messageAttachments
		});

		input = '';
		pendingAttachments = [];
		attachmentError = '';
		isLoading = true;
		autoResizeTextarea();
		scrollToBottom();

		try {
			// Stream response from API with selected model
			const response = await fetch('/api/chat/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: $currentMessages,
					model: selectedModel,
					conversationId
				})
			});

			if (!response.ok) {
				throw new Error('Failed to send message');
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response body');

			const decoder = new TextDecoder();
			let assistantContent = '';
			let usageData: MessageCost | undefined;
			let assistantMessageId: string | undefined;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							if (parsed.error) {
								throw new Error(parsed.error);
							}
							if (parsed.status) {
								streamingStatus = parsed.status.message;
								streamingKeyName = parsed.status.keyName;
							}
							if (parsed.meta?.assistantMessageId) {
								assistantMessageId = parsed.meta.assistantMessageId;
							}
							if (parsed.content) {
								assistantContent += parsed.content;
								streamingContent = assistantContent;
								// Clear status once content starts flowing
								streamingStatus = '';
							}
							if (parsed.usage) {
								usageData = {
									inputTokens: parsed.usage.inputTokens,
									outputTokens: parsed.usage.outputTokens,
									totalCost: parsed.usage.totalCost,
									model: parsed.usage.model,
									displayName: parsed.usage.displayName
								};
							}
						} catch (e) {
							console.error('Failed to parse SSE:', e);
						}
					}
				}
			}

			// Add complete assistant message to store with cost data
			// The server persists the assistant message via waitUntil, so we just use
			// the server-assigned ID so store and D1 stay in sync
			chatHistoryStore.addMessage(conversationId, {
				role: 'assistant',
				content: assistantContent,
				cost: usageData,
				id: assistantMessageId
			});
			streamingContent = '';
			streamingStatus = '';
			streamingKeyName = '';
		} catch (err) {
			console.error('Send message error:', err);
			const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
			// Show error message
			chatHistoryStore.addMessage(conversationId, {
				role: 'assistant',
				content: `⚠️ ${errorMsg}`
			});
		} finally {
			isLoading = false;
			scrollToBottom();
		}
	}

	/**
	 * Send a video generation request
	 */
	async function sendVideoGeneration(conversationId: string, prompt: string) {
		// Add user message
		const userCost: MessageCost = {
			inputTokens: 0,
			outputTokens: 0,
			totalCost: 0,
			model: selectedVideoModel || 'sora',
			displayName: 'Video Generation'
		};
		chatHistoryStore.addMessage(conversationId, {
			role: 'user',
			content: prompt,
			cost: userCost
		});

		input = '';
		isLoading = true;
		autoResizeTextarea();
		scrollToBottom();

		try {
			// Start video generation
			const response = await fetch('/api/video/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt,
					model: selectedVideoModel,
					aspectRatio: videoAspectRatio,
					conversationId
				})
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Failed to start video generation' }));
				throw new Error(errorData.error || 'Failed to start video generation');
			}

			const data = await response.json();

			// Add assistant message with video media in generating state
			const videoMessage = chatHistoryStore.addMessage(conversationId, {
				role: 'assistant',
				content: `Generating video: "${prompt}"`,
				id: data.messageId,
				media: {
					type: 'video',
					status: 'generating',
					progress: 0,
					generationId: data.generationId,
					providerJobId: data.providerJobId
				}
			});

			isLoading = false;
			scrollToBottom();

			// Connect to SSE for progress updates
			connectToVideoProgress(conversationId, videoMessage.id, data.generationId);
		} catch (err: any) {
			console.error('Video generation error:', err);
			chatHistoryStore.addMessage(conversationId, {
				role: 'assistant',
				content: `Failed to generate video: ${err.message || 'Unknown error'}`
			});
			isLoading = false;
			scrollToBottom();
		}
	}

	/**
	 * Connect to SSE stream for video generation progress
	 */
	function connectToVideoProgress(
		conversationId: string,
		messageId: string,
		generationId: string
	) {
		const eventSource = new EventSource(`/api/video/${generationId}/stream`);

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				if (data.status === 'complete') {
					chatHistoryStore.updateMessageMedia(conversationId, messageId, {
						status: 'complete',
						url: data.videoUrl,
						thumbnailUrl: data.thumbnailUrl,
						duration: data.duration,
						progress: 100
					});
					eventSource.close();
					scrollToBottom();
				} else if (data.status === 'error') {
					chatHistoryStore.updateMessageMedia(conversationId, messageId, {
						status: 'error',
						error: data.error || 'Video generation failed'
					});
					eventSource.close();
				} else if (data.progress !== undefined) {
					chatHistoryStore.updateMessageMedia(conversationId, messageId, {
						status: 'generating',
						progress: data.progress
					});
				}
			} catch (e) {
				console.error('Failed to parse video progress:', e);
			}
		};

		eventSource.onerror = () => {
			chatHistoryStore.updateMessageMedia(conversationId, messageId, {
				status: 'error',
				error: 'Lost connection to video generation'
			});
			eventSource.close();
		};
	}

	/**
	 * Retry a failed video generation
	 */
	function handleVideoRetry(event: CustomEvent<{ prompt: string }>) {
		const conversationId = $chatHistoryStore.currentConversationId;
		if (!conversationId) return;

		sendVideoGeneration(conversationId, event.detail.prompt);
	}

	/**
	 * Handle file selection from file input
	 */
	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files?.length) return;
		await addFiles(Array.from(input.files));
		// Reset input so the same file can be selected again
		input.value = '';
	}

	/**
	 * Handle drag over events
	 */
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;
	}

	/**
	 * Handle file drop
	 */
	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;
		if (!event.dataTransfer?.files?.length) return;
		await addFiles(Array.from(event.dataTransfer.files));
	}

	/**
	 * Handle paste events for image paste
	 */
	async function handlePaste(event: ClipboardEvent) {
		const items = event.clipboardData?.items;
		if (!items) return;

		const files: File[] = [];
		for (const item of items) {
			if (item.kind === 'file') {
				const file = item.getAsFile();
				if (file) files.push(file);
			}
		}

		if (files.length > 0) {
			event.preventDefault();
			await addFiles(files);
		}
	}

	/**
	 * Add files as pending attachments
	 */
	async function addFiles(files: File[]) {
		attachmentError = '';

		for (const file of files) {
			if (pendingAttachments.length >= MAX_ATTACHMENTS) {
				attachmentError = `Maximum ${MAX_ATTACHMENTS} attachments allowed`;
				break;
			}

			const validationError = validateAttachmentFile(file);
			if (validationError) {
				attachmentError = validationError;
				continue;
			}

			try {
				const dataUrl = await fileToDataUrl(file);
				const attachmentType = getAttachmentType(file.type);

				const attachment: ChatAttachment = {
					id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
					type: attachmentType!,
					name: file.name,
					url: dataUrl,
					mimeType: file.type,
					size: file.size
				};

				pendingAttachments = [...pendingAttachments, attachment];
			} catch (err) {
				attachmentError = `Failed to read file: ${file.name}`;
			}
		}
	}

	/**
	 * Remove a pending attachment
	 */
	function removeAttachment(id: string) {
		pendingAttachments = pendingAttachments.filter((a) => a.id !== id);
		attachmentError = '';
	}

	/**
	 * Open the file picker
	 */
	function openFilePicker() {
		fileInputElement?.click();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	async function toggleVoiceChat() {
		if (isVoiceActive) {
			stopVoiceChat();
		} else {
			await startVoiceChat();
		}
	}

	async function startVoiceChat() {
		try {
			// Get ephemeral token
			const response = await fetch('/api/chat/voice/session', {
				method: 'POST'
			});

			if (!response.ok) {
				if (response.status === 403) {
					// Voice chat not enabled
					voiceAvailable = false;
					const errorData = await response
						.json()
						.catch(() => ({ error: 'Voice chat is not enabled' }));
					alert(
						errorData.error || 'Voice chat is not enabled. Please enable it in admin settings.'
					);
					return;
				}
				throw new Error('Failed to create voice session');
			}

			const { token, model } = await response.json();

			// Track the current voice model for cost calculation
			currentVoiceModel = model || 'gpt-4o-realtime-preview-2024-12-17';
			voiceSessionUsage = { inputTokens: 0, outputTokens: 0 };

			// Get microphone access with specific constraints for OpenAI Realtime API
			mediaStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1, // Mono
					echoCancellation: true,
					noiseSuppression: true
				}
			});

			// Setup audio context - browser will handle sample rate
			audioContext = new AudioContext();

			const source = audioContext.createMediaStreamSource(mediaStream);

			// Setup audio processor to capture and send audio to WebSocket
			// Using ScriptProcessorNode (deprecated but widely supported)
			const bufferSize = 4096;
			audioProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

			source.connect(audioProcessor);
			audioProcessor.connect(audioContext.destination);

			// Set voice active BEFORE connecting WebSocket so UI updates
			isVoiceActive = true;
			voiceState = 'listening';

			// Connect to OpenAI Realtime API via WebSocket
			const wsModel = model || 'gpt-4o-realtime-preview-2024-12-17';
			console.log('Connecting to OpenAI Realtime API with model:', wsModel);

			realtimeWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${wsModel}`, [
				'realtime',
				`openai-insecure-api-key.${token}`,
				'openai-beta.realtime-v1'
			]);

			realtimeWs.onopen = () => {
				console.log('Voice chat WebSocket connected successfully');
				console.log('WebSocket readyState:', realtimeWs?.readyState);
				// Don't send session.update here - wait for session.created event
			};

			// Setup audio processor callback (will only send when sessionConfigured is true)
			if (audioProcessor) {
				audioProcessor.onaudioprocess = (e) => {
					// Only send audio after session is configured
					if (!sessionConfigured || !realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;

					const inputData = e.inputBuffer.getChannelData(0);

					// Resample to 24kHz if needed (OpenAI expects 24kHz)
					const targetSampleRate = 24000;
					const currentSampleRate = audioContext?.sampleRate || 48000;

					let resampledData: Float32Array;
					if (currentSampleRate !== targetSampleRate) {
						const ratio = currentSampleRate / targetSampleRate;
						const newLength = Math.floor(inputData.length / ratio);
						resampledData = new Float32Array(newLength);
						for (let i = 0; i < newLength; i++) {
							resampledData[i] = inputData[Math.floor(i * ratio)];
						}
					} else {
						resampledData = inputData;
					}

					// Convert Float32 to Int16 PCM
					const pcm16 = new Int16Array(resampledData.length);
					for (let i = 0; i < resampledData.length; i++) {
						// Clamp to [-1, 1] and convert to Int16 range
						const s = Math.max(-1, Math.min(1, resampledData[i]));
						pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
					}

					// Convert to base64
					const base64 = arrayBufferToBase64(pcm16.buffer);

					// Send to OpenAI
					realtimeWs.send(
						JSON.stringify({
							type: 'input_audio_buffer.append',
							audio: base64
						})
					);
				};
			}

			realtimeWs.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);

					// Log ALL events for debugging
					console.log('Realtime event received:', data.type, data);

					// Handle session.created - now we can configure our session
					if (data.type === 'session.created') {
						console.log('Session created:', data.session?.id);
						console.log('Full session data:', JSON.stringify(data.session, null, 2));
						// Now send our session configuration
						if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
							const sessionConfig = {
								type: 'session.update',
								session: {
									modalities: ['text', 'audio'],
									voice: 'alloy',
									input_audio_format: 'pcm16',
									output_audio_format: 'pcm16',
									input_audio_transcription: {
										model: 'whisper-1'
									},
									turn_detection: {
										type: 'server_vad',
										threshold: 0.5,
										prefix_padding_ms: 300,
										silence_duration_ms: 500
									},
									temperature: 0.8
								}
							};
							console.log('Sending session.update:', JSON.stringify(sessionConfig, null, 2));
							realtimeWs.send(JSON.stringify(sessionConfig));
						}
					}

					// Handle session.updated - session is now fully configured, can start audio
					if (data.type === 'session.updated') {
						console.log('Session configured and ready:', data.session?.id);
						sessionConfigured = true;
					}

					// Track when user starts speaking
					if (data.type === 'input_audio_buffer.speech_started') {
						voiceState = 'listening';
					}

					// Track when user stops speaking (processing begins)
					if (data.type === 'input_audio_buffer.speech_stopped') {
						voiceState = 'processing';
					}

					// Handle user input transcription
					if (data.type === 'conversation.item.input_audio_transcription.completed') {
						const transcript = data.transcript;
						if (transcript) {
							if (pendingUserMessageId) {
								// Update the placeholder message with actual transcript
								messages = messages.map((msg) =>
									msg.id === pendingUserMessageId ? { ...msg, content: transcript } : msg
								);
								pendingUserMessageId = null;
							} else {
								// No pending message, add new one (shouldn't happen often)
								const userMessage = {
									id: Date.now().toString(),
									role: 'user' as const,
									content: transcript,
									timestamp: new Date()
								};
								messages = [...messages, userMessage];
							}
							currentUserTranscript = '';
							scrollToBottom();
						}
					}

					// Handle live user transcription (while speaking)
					if (data.type === 'conversation.item.input_audio_transcription.delta') {
						currentUserTranscript += data.delta;
						voiceState = 'listening';
					}

					// Handle audio response from AI
					if (data.type === 'response.audio.delta') {
						voiceState = 'speaking';
						// Decode and queue audio for playback
						if (data.delta) {
							const audioData = base64ToArrayBuffer(data.delta);
							audioQueue.push(audioData);
							playNextAudioChunk();
						}
					}

					// Handle AI response transcript
					if (data.type === 'response.audio_transcript.delta') {
						voiceState = 'speaking';
						if (!currentAssistantId) {
							// First, ensure user message exists before assistant response
							if (!pendingUserMessageId) {
								// Create placeholder for user message (will be updated with transcript)
								pendingUserMessageId = Date.now().toString();
								const userPlaceholder = {
									id: pendingUserMessageId,
									role: 'user' as const,
									content: currentUserTranscript || '...',
									timestamp: new Date()
								};
								messages = [...messages, userPlaceholder];
							}

							// Now start new assistant message
							currentAssistantId = (Date.now() + 1).toString();
							const assistantMessage = {
								id: currentAssistantId,
								role: 'assistant' as const,
								content: data.delta || '',
								timestamp: new Date()
							};
							messages = [...messages, assistantMessage];
						} else {
							// Update existing assistant message
							messages = messages.map((msg) =>
								msg.id === currentAssistantId
									? { ...msg, content: msg.content + (data.delta || '') }
									: msg
							);
						}
						scrollToBottom();
					}

					// Handle AI response completion - back to listening
					if (data.type === 'response.done') {
						console.log('Response done - full data:', JSON.stringify(data, null, 2));
						console.log('Response status:', data.response?.status);
						console.log('Response output:', data.response?.output);

						// Extract usage data from response
						const usage = data.response?.usage;
						if (usage && currentAssistantId) {
							const inputTokens = usage.input_tokens || 0;
							const outputTokens = usage.output_tokens || 0;
							const costResult = calculateCost(currentVoiceModel, inputTokens, outputTokens);

							const messageCost: MessageCost = {
								inputTokens,
								outputTokens,
								totalCost: costResult.totalCost,
								model: currentVoiceModel,
								displayName: getModelDisplayName(currentVoiceModel)
							};

							// Update the assistant message with cost info
							messages = messages.map((msg) =>
								msg.id === currentAssistantId ? { ...msg, cost: messageCost } : msg
							);

							// Also save to the store if we have a conversation
							const conversationId = $chatHistoryStore.currentConversationId;
							if (conversationId) {
								// Find the assistant message and save it with cost
								const assistantMsg = messages.find((m) => m.id === currentAssistantId);
								if (assistantMsg) {
									chatHistoryStore.addMessage(conversationId, {
										role: 'assistant',
										content: assistantMsg.content,
										cost: messageCost
									});
								}

								// Also persist the user message if there was a pending one
								const userMsg = messages.find((m) => m.id === pendingUserMessageId);
								if (userMsg) {
									chatHistoryStore.addMessage(conversationId, {
										role: 'user',
										content: userMsg.content
									});
								}
							}

							console.log('Voice message cost:', formatCost(costResult.totalCost));
						}

						// Check if response was cancelled or had no output
						if (data.response?.status === 'cancelled') {
							console.warn('Response was cancelled');
						} else if (!data.response?.output || data.response.output.length === 0) {
							console.warn('Response had no output items');
						}

						currentAssistantId = null;
						voiceState = 'listening';
					}

					if (data.type === 'response.audio_transcript.done') {
						currentAssistantId = null;
						voiceState = 'listening';
					}

					// Handle errors from the API
					if (data.type === 'error') {
						console.error('Realtime API error:', data.error);
						const errorCode = data.error?.code;
						const errorMessage = data.error?.message || 'Unknown error';

						// Handle various error types
						if (errorCode === 'session_expired' || errorCode === 'invalid_session') {
							stopVoiceChat();
							alert('Voice session expired. Please start again.');
						} else if (errorCode === 'rate_limit_exceeded') {
							stopVoiceChat();
							alert('Rate limit exceeded. Please wait a moment and try again.');
						} else if (errorCode === 'invalid_api_key' || errorCode === 'authentication_error') {
							stopVoiceChat();
							alert('Authentication error. Please check your API key configuration.');
						} else if (errorCode === 'model_not_found' || errorCode === 'invalid_model') {
							stopVoiceChat();
							alert('Voice model not available. Please check your configuration.');
						} else {
							// Log but don't necessarily stop for unknown errors
							console.warn(`Voice chat error (${errorCode}): ${errorMessage}`);
						}
					}
				} catch (err) {
					console.error('Failed to parse WebSocket message:', err);
				}
			};

			realtimeWs.onerror = (err) => {
				console.error('Voice chat WebSocket error event:', err);
				console.error('WebSocket readyState at error:', realtimeWs?.readyState);
				// Don't stop immediately - wait for close event
			};

			realtimeWs.onclose = (event) => {
				console.log('Voice chat WebSocket closed');
				console.log('Close code:', event.code);
				console.log('Close reason:', event.reason || '(no reason provided)');
				console.log('Was clean close:', event.wasClean);

				// Only stop if we're still supposed to be active
				if (isVoiceActive) {
					// Check if it was a clean close or an error
					if (event.code !== 1000) {
						console.error('WebSocket closed unexpectedly with code:', event.code);
						// Show helpful error message based on close code
						if (event.code === 1006) {
							// Abnormal closure - could be network issue or server rejection
							console.error('Connection closed abnormally (1006). This typically means:');
							console.error('- Invalid or expired authentication token');
							console.error('- Network connectivity issue');
							console.error('- Server rejected the connection');
						} else if (event.code === 1008) {
							// Policy violation
							console.error('Connection closed due to policy violation (1008).');
						} else if (event.code === 1011) {
							// Server error
							console.error('Server encountered an error (1011).');
						} else if (event.code === 1002) {
							console.error('Protocol error (1002).');
						} else if (event.code === 1003) {
							console.error('Unsupported data (1003).');
						}
					}
					stopVoiceChat();
				}
			};
		} catch (err) {
			console.error('Failed to start voice chat:', err);
			if (err instanceof Error && err.message.includes('Permission denied')) {
				alert('Microphone permission denied. Please allow microphone access to use voice chat.');
			} else if (err instanceof Error) {
				alert(`Failed to start voice chat: ${err.message}`);
			}
			stopVoiceChat();
		}
	}

	function arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	function base64ToArrayBuffer(base64: string): ArrayBuffer {
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes.buffer;
	}

	async function playNextAudioChunk() {
		if (isPlayingAudio || audioQueue.length === 0 || !audioContext) return;

		isPlayingAudio = true;
		const audioData = audioQueue.shift()!;

		try {
			// Convert Int16 PCM to Float32 for AudioContext
			const pcm16 = new Int16Array(audioData);
			const float32 = new Float32Array(pcm16.length);
			for (let i = 0; i < pcm16.length; i++) {
				float32[i] = pcm16[i] / 32768.0;
			}

			// Create audio buffer at 24kHz (OpenAI Realtime API output sample rate)
			// This must match the API's output rate, not the AudioContext's rate
			const OPENAI_OUTPUT_SAMPLE_RATE = 24000;
			const audioBuffer = audioContext.createBuffer(1, float32.length, OPENAI_OUTPUT_SAMPLE_RATE);
			audioBuffer.getChannelData(0).set(float32);

			// Create and play buffer source
			const source = audioContext.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(audioContext.destination);

			source.onended = () => {
				isPlayingAudio = false;
				// Play next chunk if available
				if (audioQueue.length > 0) {
					playNextAudioChunk();
				}
			};

			source.start(0);
		} catch (err) {
			console.error('Audio playback error:', err);
			isPlayingAudio = false;
			// Try next chunk
			if (audioQueue.length > 0) {
				playNextAudioChunk();
			}
		}
	}

	function stopVoiceChat() {
		isVoiceActive = false;
		voiceState = 'idle';
		currentUserTranscript = '';
		currentAssistantId = null;
		pendingUserMessageId = null;
		audioQueue = [];
		isPlayingAudio = false;
		sessionConfigured = false;

		if (realtimeWs) {
			realtimeWs.close();
			realtimeWs = null;
		}

		if (audioProcessor) {
			audioProcessor.disconnect();
			audioProcessor.onaudioprocess = null;
			audioProcessor = null;
		}

		if (mediaStream) {
			mediaStream.getTracks().forEach((track) => track.stop());
			mediaStream = null;
		}

		if (audioContext) {
			audioContext.close();
			audioContext = null;
		}
	}
</script>

<svelte:head>
	<title>AI Chat - Nabu</title>
</svelte:head>

<div class="chat-interface">
	<!-- Messages container -->
	<div class="chat-messages" bind:this={chatContainer} role="region" aria-label="Chat messages">
		{#each messages as message (message.id)}
			<div
				class="message"
				class:user={message.role === 'user'}
				class:assistant={message.role === 'assistant'}
				in:fly={{ y: 20, duration: 400, easing: quintOut }}
			>
				<div class="message-avatar">
					{#if message.role === 'user'}
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
							<circle cx="12" cy="7" r="4" />
						</svg>
					{:else}
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M12 2L2 7l10 5 10-5-10-5z" />
							<path d="M2 17l10 5 10-5" />
							<path d="M2 12l10 5 10-5" />
						</svg>
					{/if}
				</div>
				<div class="message-bubble">
					{#if message.media}
						<VideoCard
							media={message.media}
							prompt={message.content}
							on:retry={handleVideoRetry}
						/>
					{:else}
						<div class="message-content">{message.content}</div>
					{/if}
					{#if message.attachments && message.attachments.length > 0}
						<div class="message-attachments">
							{#each message.attachments as attachment (attachment.id)}
								<div class="attachment-preview-item">
									{#if attachment.type === 'image'}
										<img
											src={attachment.url}
											alt={attachment.name}
											class="attachment-image"
											loading="lazy"
										/>
									{:else if attachment.type === 'video'}
										<video
											src={attachment.url}
											controls
											class="attachment-video"
											preload="metadata"
										>
											<track kind="captions" />
										</video>
									{/if}
									<span class="attachment-name">{attachment.name}</span>
								</div>
							{/each}
						</div>
					{/if}
					<div class="message-meta">
						<span class="message-timestamp">
							{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
						</span>
						{#if message.cost}
							<span
								class="message-cost"
								title={message.role === 'user'
									? `Sent using ${message.cost.displayName}`
									: `${message.cost.displayName}\nInput: ${message.cost.inputTokens.toLocaleString()} tokens\nOutput: ${message.cost.outputTokens.toLocaleString()} tokens`}
							>
								<span class="cost-model">{message.cost.displayName}</span>
								{#if message.role === 'assistant' && message.cost.totalCost > 0}
									<span class="cost-amount">{formatCost(message.cost.totalCost)}</span>
								{/if}
							</span>
						{/if}
					</div>
				</div>
			</div>
		{/each}

		{#if currentUserTranscript && isVoiceActive}
			<div class="message user streaming" in:fade={{ duration: 200 }}>
				<div class="message-avatar">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
						<circle cx="12" cy="7" r="4" />
					</svg>
				</div>
				<div class="message-bubble">
					<div class="message-content">{currentUserTranscript}<span class="cursor">|</span></div>
				</div>
			</div>
		{/if}

		{#if streamingContent}
			<div class="message assistant streaming" in:fade={{ duration: 200 }}>
				<div class="message-avatar">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 2L2 7l10 5 10-5-10-5z" />
						<path d="M2 17l10 5 10-5" />
						<path d="M2 12l10 5 10-5" />
					</svg>
				</div>
				<div class="message-bubble">
					<div class="message-content">{streamingContent}<span class="cursor">|</span></div>
					{#if streamingKeyName}
						<div class="message-meta">
							<span class="streaming-provider">{streamingKeyName}</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if isLoading && !streamingContent}
			<div
				class="message assistant"
				in:fade={{ duration: 200 }}
				role="status"
				aria-label="AI is typing"
			>
				<div class="message-avatar">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 2L2 7l10 5 10-5-10-5z" />
						<path d="M2 17l10 5 10-5" />
						<path d="M2 12l10 5 10-5" />
					</svg>
				</div>
				<div class="message-bubble">
					{#if streamingStatus}
						<div class="streaming-status">{streamingStatus}</div>
					{:else}
						<div class="typing-indicator">
							<span></span>
							<span></span>
							<span></span>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Unified Input Area -->
	<div class="unified-input-area">
		<!-- Model selector (only if multiple models available) -->
		{#if showModelSelector && !isVoiceActive}
			<div class="model-selector" in:fade={{ duration: 200 }}>
				<label for="model-select" class="model-label">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 2L2 7l10 5 10-5-10-5z" />
						<path d="M2 17l10 5 10-5" />
						<path d="M2 12l10 5 10-5" />
					</svg>
					{isVideoMode ? 'Video Model:' : 'Model:'}
				</label>
				{#if isVideoMode}
					<select
						id="model-select"
						bind:value={selectedVideoModel}
						class="model-select"
						disabled={isLoading || isLoadingModels}
					>
						{#each availableVideoModels as model}
							<option value={model.id}>{model.displayName}</option>
						{/each}
					</select>
					<select
						bind:value={videoAspectRatio}
						class="model-select aspect-select"
						disabled={isLoading}
					>
						<option value="16:9">16:9</option>
						<option value="9:16">9:16</option>
						<option value="1:1">1:1</option>
					</select>
				{:else}
					<select
						id="model-select"
						bind:value={selectedModel}
						class="model-select"
						disabled={isLoading || isLoadingModels}
					>
						{#each availableModels as model}
							<option value={model.id}>{model.displayName}</option>
						{/each}
					</select>
				{/if}
			</div>
		{/if}

		<!-- Main input container -->
		<div class="input-wrapper">
			<!-- Pending attachments preview -->
			{#if pendingAttachments.length > 0}
				<div class="pending-attachments" in:fly={{ y: 10, duration: 200 }}>
					{#each pendingAttachments as attachment (attachment.id)}
						<div class="pending-attachment" in:fade={{ duration: 150 }}>
							{#if attachment.type === 'image'}
								<img src={attachment.url} alt={attachment.name} class="pending-thumbnail" />
							{:else}
								<div class="pending-video-icon">
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<rect x="2" y="4" width="20" height="16" rx="2" />
										<polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
									</svg>
								</div>
							{/if}
							<span class="pending-name" title={attachment.name}>{attachment.name}</span>
							<button
								class="remove-attachment"
								on:click={() => removeAttachment(attachment.id)}
								aria-label="Remove {attachment.name}"
								title="Remove attachment"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Attachment error message -->
			{#if attachmentError}
				<div class="attachment-error" in:fade={{ duration: 200 }}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" />
						<line x1="9" y1="9" x2="15" y2="15" />
					</svg>
					{attachmentError}
				</div>
			{/if}

			<div
				class="input-container"
				class:focused={isFocused}
				class:drag-over={isDragOver}
				on:dragover={handleDragOver}
				on:dragleave={handleDragLeave}
				on:drop={handleDrop}
				role="region"
				aria-label="Message input with file drop support"
			>
				<!-- Hidden file input -->
				<input
					type="file"
					bind:this={fileInputElement}
					on:change={handleFileSelect}
					accept={getAcceptString()}
					multiple
					class="hidden-file-input"
					aria-hidden="true"
					tabindex="-1"
				/>

				<!-- Attach button -->
				{#if !isVoiceActive && !isVideoMode}
					<button
						class="attach-button"
						on:click={openFilePicker}
						disabled={isLoading || pendingAttachments.length >= MAX_ATTACHMENTS}
						aria-label="Attach image or video"
						title="Attach image or video"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
						</svg>
					</button>
				{/if}

				<!-- Input field with send button inside -->
				<div class="textarea-wrapper">
					<textarea
						bind:this={textareaElement}
						bind:value={input}
						on:input={autoResizeTextarea}
						on:keydown={handleKeydown}
						on:paste={handlePaste}
						on:focus={() => (isFocused = true)}
						on:blur={() => (isFocused = false)}
						placeholder={isVoiceActive
							? 'Voice chat is active'
							: isVideoMode
								? 'Describe the video you want to generate...'
								: pendingAttachments.length > 0
									? 'Add a message or send attachments...'
									: 'Message AI assistant'}
						class="chat-input"
						class:voice-active={isVoiceActive}
						class:has-send-button={!isVoiceActive}
						rows="1"
						maxlength={MAX_INPUT_LENGTH}
						disabled={isVoiceActive}
						aria-label={isVideoMode ? 'Video generation prompt' : 'Chat message input'}
					></textarea>

					<!-- Character count (shows when approaching limit) -->
					{#if showCharCount}
						<div
							class="char-count"
							class:warning={inputLength > MAX_INPUT_LENGTH * 0.9}
							in:fade={{ duration: 200 }}
						>
							{inputLength}/{MAX_INPUT_LENGTH}
						</div>
					{/if}

					<!-- Send button (inside input) -->
					{#if !isVoiceActive}
						<button
							on:click={sendMessage}
							disabled={!canSend}
							class="send-button-inline"
							class:can-send={canSend}
							aria-label="Send message"
							title="Send message (Enter)"
						>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M22 2L11 13" />
								<path d="M22 2L15 22L11 13L2 9L22 2z" />
							</svg>
						</button>
					{/if}
				</div>

				<!-- Drag overlay -->
				{#if isDragOver}
					<div class="drag-overlay" in:fade={{ duration: 150 }}>
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						<span>Drop files here</span>
					</div>
				{/if}

				<!-- Video mode toggle button -->
				{#if videoAvailable}
					<button
						class="video-toggle-button"
						class:active={isVideoMode}
						on:click={() => (isVideoMode = !isVideoMode)}
						aria-label={isVideoMode ? 'Switch to text chat' : 'Switch to video generation'}
						title={isVideoMode ? 'Switch to text chat' : 'Generate video'}
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							{#if isVideoMode}
								<rect x="2" y="4" width="20" height="16" rx="2" />
								<polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
							{:else}
								<rect x="2" y="4" width="20" height="16" rx="2" />
								<polygon points="10,9 16,12 10,15" />
							{/if}
						</svg>
					</button>
				{/if}

				<!-- Voice toggle button (on the right) -->
				{#if voiceAvailable}
					<VoiceButton isActive={isVoiceActive} state={voiceState} onClick={toggleVoiceChat} />
				{/if}
			</div>
			<!-- Input hint -->
			<div class="input-hint" class:visible={!isVoiceActive}>
				<span class="hint-text">
					{#if isVideoMode}
						<kbd>Enter</kbd> to generate video • <kbd>Shift + Enter</kbd> for new line
					{:else}
						<kbd>Enter</kbd> to send • <kbd>Shift + Enter</kbd> for new line
					{/if}
				</span>
			</div>
		</div>
	</div>
</div>

<style>
	.chat-interface {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-background);
		position: relative;
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
	}

	.message {
		display: flex;
		gap: var(--spacing-md);
		max-width: 90%;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.message.user {
		align-self: flex-end;
		flex-direction: row-reverse;
	}

	.message.assistant {
		align-self: flex-start;
	}

	.message-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text);
	}

	.message.user .message-avatar {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		border: none;
		color: white;
	}

	.message-bubble {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		min-width: 0;
	}

	.message-content {
		background: var(--color-surface);
		padding: var(--spacing-md) var(--spacing-lg);
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border);
		word-wrap: break-word;
		white-space: pre-wrap;
		font-size: 0.938rem;
		line-height: 1.6;
		box-shadow: var(--shadow-sm);
		position: relative;
	}

	.message.user .message-content {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: white;
		border: none;
	}

	.message.streaming .message-content {
		border-color: var(--color-primary);
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
		}
	}

	.cursor {
		display: inline-block;
		animation: blink 1s steps(2) infinite;
		color: var(--color-primary);
		font-weight: bold;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	.message-meta {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: 0 var(--spacing-sm);
		flex-wrap: wrap;
	}

	.message-timestamp {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.message-cost {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		cursor: help;
	}

	.cost-model {
		color: var(--color-primary);
		font-weight: 500;
	}

	.cost-amount {
		color: var(--color-text-secondary);
		font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
	}

	.typing-indicator {
		display: flex;
		gap: 6px;
		padding: var(--spacing-sm);
	}

	.typing-indicator span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-text-secondary);
		animation: typing 1.4s infinite;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%,
		60%,
		100% {
			transform: translateY(0);
			opacity: 0.7;
		}
		30% {
			transform: translateY(-10px);
			opacity: 1;
		}
	}

	.streaming-status {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		padding: var(--spacing-xs) var(--spacing-sm);
		font-style: italic;
	}

	.streaming-provider {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		opacity: 0.8;
	}

	.unified-input-area {
		padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
		backdrop-filter: blur(12px);
		position: relative;
	}

	.model-selector {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		max-width: 1200px;
		margin: 0 auto var(--spacing-sm);
		padding: 0 var(--spacing-xs);
	}

	.model-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.model-select {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-background);
		color: var(--color-text);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all var(--transition-fast);
		min-width: 140px;
	}

	.model-select:hover:not(:disabled) {
		border-color: var(--color-primary);
	}

	.model-select:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
	}

	.model-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.input-wrapper {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.input-container {
		display: flex;
		gap: var(--spacing-sm);
		align-items: flex-end;
		background: var(--color-background);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: var(--spacing-sm);
		transition: all var(--transition-base);
		box-shadow: var(--shadow-sm);
	}

	.input-container.focused {
		border-color: var(--color-primary);
		box-shadow:
			0 0 0 4px rgba(59, 130, 246, 0.08),
			var(--shadow-md);
	}

	.input-container:hover:not(.focused) {
		border-color: var(--color-text-secondary);
	}

	.textarea-wrapper {
		flex: 1;
		position: relative;
		display: flex;
		align-items: flex-end;
	}

	.chat-input {
		flex: 1;
		background: transparent;
		border: none;
		padding: var(--spacing-sm) var(--spacing-md);
		font-family: var(--font-sans);
		font-size: 0.938rem;
		color: var(--color-text);
		resize: none;
		min-height: 44px;
		max-height: 200px;
		line-height: 1.6;
		transition: opacity var(--transition-fast);
		scrollbar-width: thin;
		scrollbar-color: var(--color-border) transparent;
	}

	.chat-input.has-send-button {
		padding-right: 52px;
	}

	.chat-input::-webkit-scrollbar {
		width: 6px;
	}

	.chat-input::-webkit-scrollbar-track {
		background: transparent;
	}

	.chat-input::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: var(--radius-sm);
	}

	.chat-input::-webkit-scrollbar-thumb:hover {
		background: var(--color-text-secondary);
	}

	.chat-input:focus {
		outline: none;
	}

	.chat-input::placeholder {
		color: var(--color-text-secondary);
		opacity: 0.7;
	}

	.chat-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.char-count {
		position: absolute;
		right: var(--spacing-sm);
		bottom: var(--spacing-xs);
		font-size: 0.688rem;
		color: var(--color-text-secondary);
		background: var(--color-background);
		padding: 2px var(--spacing-xs);
		border-radius: var(--radius-sm);
		pointer-events: none;
		transition: color var(--transition-fast);
	}

	.char-count.warning {
		color: var(--color-warning);
		font-weight: 600;
	}

	.send-button-inline {
		position: absolute;
		right: var(--spacing-xs);
		bottom: var(--spacing-xs);
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--transition-base);
		flex-shrink: 0;
		border: none;
		background: var(--color-surface);
		color: var(--color-text-secondary);
	}

	.send-button-inline:hover:not(:disabled) {
		background: var(--color-surface-hover);
		color: var(--color-text);
		transform: scale(1.05);
	}

	.send-button-inline.can-send {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: white;
		box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
	}

	.send-button-inline.can-send:hover {
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
		transform: scale(1.08) translateY(-1px);
	}

	.send-button-inline.can-send:active {
		transform: scale(0.98);
	}

	.send-button-inline:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		transform: none;
	}

	.input-hint {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--spacing-sm);
		opacity: 0;
		transition: opacity var(--transition-base);
	}

	.input-hint.visible {
		opacity: 1;
	}

	.hint-text {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.hint-text kbd {
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		font-family: var(--font-mono);
		font-size: 0.688rem;
		color: var(--color-text);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	/* Video mode toggle */
	.video-toggle-button {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--transition-base);
		flex-shrink: 0;
		border: none;
		background: var(--color-surface);
		color: var(--color-text-secondary);
	}

	.video-toggle-button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
		transform: scale(1.05);
	}

	.video-toggle-button.active {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: white;
		box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
	}

	.video-toggle-button.active:hover {
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
		transform: scale(1.08);
	}

	.aspect-select {
		max-width: 90px;
	}

	/* Attachment styles */
	.hidden-file-input {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
		opacity: 0;
		pointer-events: none;
	}

	.attach-button {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--transition-base);
		flex-shrink: 0;
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
	}

	.attach-button:hover:not(:disabled) {
		background: var(--color-surface-hover);
		color: var(--color-text);
		transform: scale(1.05);
	}

	.attach-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.input-container.drag-over {
		border-color: var(--color-primary);
		background: rgba(59, 130, 246, 0.05);
	}

	.drag-overlay {
		position: absolute;
		inset: 0;
		background: rgba(59, 130, 246, 0.1);
		border-radius: var(--radius-xl);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		color: var(--color-primary);
		font-size: 0.875rem;
		font-weight: 500;
		pointer-events: none;
		z-index: 10;
	}

	.pending-attachments {
		display: flex;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		overflow-x: auto;
		scrollbar-width: thin;
	}

	.pending-attachment {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-xs) var(--spacing-sm);
		min-width: 0;
		max-width: 200px;
	}

	.pending-thumbnail {
		width: 36px;
		height: 36px;
		object-fit: cover;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}

	.pending-video-icon {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-background);
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		color: var(--color-text-secondary);
	}

	.pending-name {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.remove-attachment {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		flex-shrink: 0;
		transition: all var(--transition-fast);
	}

	.remove-attachment:hover {
		background: var(--color-error, #ef4444);
		color: white;
	}

	.attachment-error {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: 0.75rem;
		color: var(--color-error, #ef4444);
		padding: var(--spacing-xs) 0;
	}

	/* Message attachment display */
	.message-attachments {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-xs);
	}

	.attachment-preview-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		max-width: 300px;
	}

	.attachment-image {
		max-width: 100%;
		max-height: 300px;
		border-radius: var(--radius-md);
		object-fit: contain;
		cursor: pointer;
		transition: opacity var(--transition-fast);
		border: 1px solid var(--color-border);
	}

	.attachment-image:hover {
		opacity: 0.9;
	}

	.attachment-video {
		max-width: 100%;
		max-height: 300px;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.attachment-name {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (min-width: 769px) {
		.message {
			max-width: 75%;
		}

		.unified-input-area {
			padding: var(--spacing-md) var(--spacing-lg) var(--spacing-lg);
		}

		.chat-messages {
			padding: var(--spacing-lg);
			gap: var(--spacing-lg);
		}
	}
</style>
