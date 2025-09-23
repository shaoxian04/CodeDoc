const vscode = acquireVsCodeApi();

        if (typeof mermaid !== 'undefined') {
            console.log('Mermaid library loaded successfully');
            mermaid.initialize({ 
                startOnLoad: false, 
                theme: 'dark',
                themeVariables: {
                darkMode: true,
                primaryColor: '#bb86fc',
                primaryTextColor: '#ffffff',
                primaryBorderColor: '#bb86fc',
                lineColor: '#ffffff',
                secondaryColor: '#03dac6',
                tertiaryColor: '#cf6679'
                }
            });
                    console.log('Mermaid initialized with dark theme');
        } else {
            console.error('Mermaid library not found!');
        }

        function switchTab(tabName) {
            const tabs = ['overview', 'chat', 'explanation', 'visualization2'];

            tabs.forEach(name => {
                const tabContent = document.getElementById(name + '-tab');
                const tabButton = document.getElementById('tab-' + name);

                if (tabContent) {
                    tabContent.classList.toggle('active', name === tabName);
                }
                if (tabButton) {
                    tabButton.classList.toggle('active', name === tabName);
                }
            });
            
            if (tabName === 'explanation') {
                const documentationContent = document.getElementById('class-documentation-content');
                const placeholder = document.getElementById('explanation-placeholder');
                
                if (documentationContent && documentationContent.style.display !== 'none') {
                    // Documentation is already visible, keep it that way
                } else {
                    if (placeholder) {
                        placeholder.style.display = 'block';
                    }
                    if (documentationContent) {
                        documentationContent.style.display = 'none';
                    }
                }
            }
        }

        function refreshVisualization() {
            vscode.postMessage({ type: 'refreshVisualization' });
        }

        function generateProjectDocumentation() {
            vscode.postMessage({ type: 'generateProjectDocs' });
        }

        function generateClassDocumentation() {
            vscode.postMessage({ type: 'generateClassDocs' });
        }

        function exportClassDocumentation() {
            const contentContainer = document.getElementById('class-documentation-content');
            // Use stored markdown content if available, otherwise use HTML content
            const markdownContent = contentContainer.dataset.markdown;
            const content = markdownContent || document.getElementById('class-documentation-text').innerHTML;
            vscode.postMessage({ type: 'exportClassDocs', content: content });
        }

        function showClassDocumentation(content) {
            console.log('showClassDocumentation called in webview with content length:', content ? content.length : 0);
                    if (content) {
                        console.log('Content preview:', content.substring(0, Math.min(200, content.length)) + (content.length > 200 ? '...' : ''));
                    }
                    
                    document.getElementById('explanation-placeholder').style.display = 'none';
                    document.getElementById('class-documentation-content').style.display = 'block';
                    const docTextElement = document.getElementById('class-documentation-text');
                    
                    // Check if content is already HTML or needs to be converted
                    const isHtml = content && (content.startsWith('<') || content.includes('<h1') || content.includes('<p>') || content.includes('<div'));
                    console.log('Content is HTML in webview:', isHtml);
                    
                    if (isHtml) {
                        // Content is already HTML
                        console.log('Content is already HTML, using as-is');
                        docTextElement.innerHTML = content;
                    } else {
                        // Content is markdown, convert it to HTML
                        console.log('Converting markdown to HTML in webview');
                        try {
                            const convertedHtml = marked(content || '');
                            console.log('Converted HTML length:', convertedHtml.length);
                            if (convertedHtml) {
                                console.log('Converted HTML preview:', convertedHtml.substring(0, Math.min(200, convertedHtml.length)) + (convertedHtml.length > 200 ? '...' : ''));
                            }
                            docTextElement.innerHTML = convertedHtml;
                        } catch (error) {
                            console.error('Error converting markdown to HTML in webview:', error);
                            docTextElement.innerHTML = '<pre>' + (content || '') + '</pre>';
                        }
                    }
                    
                    // Force reflow to ensure proper rendering
                    docTextElement.style.display = 'none';
                    docTextElement.offsetHeight; // Trigger reflow
                    docTextElement.style.display = 'block';
                    
                    // Apply styling to markdown elements and process Mermaid diagrams
                    setTimeout(() => {
                        applyMarkdownStyling(docTextElement);
                        processMermaidDiagrams(docTextElement);
                    }, 100);
        }

        function showProjectDocumentation(content) {
            console.log('showProjectDocumentation called in webview with content length:', content ? content.length : 0);
                    if (content) {
                        console.log('Content preview:', content.substring(0, Math.min(200, content.length)) + (content.length > 200 ? '...' : ''));
                    }
                    
                    document.getElementById('explanation-placeholder').style.display = 'none';
                    document.getElementById('class-documentation-content').style.display = 'block';
                    const docTextElement = document.getElementById('class-documentation-text');
                    
                    // Check if content is already HTML or needs to be converted
                    const isHtml = content && (content.startsWith('<') || content.includes('<h1') || content.includes('<p>') || content.includes('<div'));
                    console.log('Content is HTML in webview:', isHtml);
                    
                    if (isHtml) {
                        // Content is already HTML
                        console.log('Content is already HTML, using as-is');
                        docTextElement.innerHTML = content;
                    } else {
                        // Content is markdown, convert it to HTML
                        console.log('Converting markdown to HTML in webview');
                        try {
                            const convertedHtml = marked(content || '');
                            console.log('Converted HTML length:', convertedHtml.length);
                            if (convertedHtml) {
                                console.log('Converted HTML preview:', convertedHtml.substring(0, Math.min(200, convertedHtml.length)) + (convertedHtml.length > 200 ? '...' : ''));
                            }
                            docTextElement.innerHTML = convertedHtml;
                        } catch (error) {
                            console.error('Error converting markdown to HTML in webview:', error);
                            docTextElement.innerHTML = '<pre>' + (content || '') + '</pre>';
                        }
                    }
                    
                    // Force reflow to ensure proper rendering
                    docTextElement.style.display = 'none';
                    docTextElement.offsetHeight; // Trigger reflow
                    docTextElement.style.display = 'block';
                    
                    // Apply styling to markdown elements and process Mermaid diagrams
                    setTimeout(() => {
                        applyMarkdownStyling(docTextElement);
                        processMermaidDiagrams(docTextElement);
                    }, 100);
        }
        function processMermaidDiagrams(element) {
                    console.log('Processing Mermaid diagrams...');
                    console.log('Element HTML:', element.innerHTML);
                    
                    // Find all code blocks that might contain Mermaid
                    const codeBlocks = element.querySelectorAll('pre code, code');
                    console.log('Found code blocks:', codeBlocks.length);
                    let mermaidCount = 0;
                    
                    codeBlocks.forEach((block, index) => {
                        const content = block.textContent || '';
                        
                        // Check if this is a Mermaid diagram
                        if (content.trim().startsWith('erDiagram') || 
                            content.trim().startsWith('classDiagram') || 
                            content.trim().startsWith('graph') ||
                            content.trim().startsWith('flowchart') ||
                            content.trim().startsWith('sequenceDiagram') ||
                            content.trim().startsWith('gantt') ||
                            content.trim().startsWith('pie') ||
                            content.trim().startsWith('gitgraph')) {
                            
                            console.log('Found Mermaid diagram:', content.substring(0, 50) + '...');
                            
                            // Create a new div for the Mermaid diagram
                            const mermaidDiv = document.createElement('div');
                            mermaidDiv.className = 'mermaid';
                            mermaidDiv.textContent = content.trim();
                            mermaidDiv.id = 'mermaid-' + Date.now() + '-' + mermaidCount;
                            mermaidDiv.style.textAlign = 'center';
                            mermaidDiv.style.margin = '20px 0';
                            mermaidDiv.style.backgroundColor = 'var(--vscode-editor-background)';
                            mermaidDiv.style.padding = '20px';
                            mermaidDiv.style.borderRadius = '8px';
                            mermaidDiv.style.border = '1px solid var(--vscode-panel-border)';
                            
                            // Replace the code block with the Mermaid div
                            const parentPre = block.closest('pre');
                            if (parentPre) {
                                parentPre.replaceWith(mermaidDiv);
                            } else {
                                block.replaceWith(mermaidDiv);
                            }
                            
                            mermaidCount++;
                        }
                    });
                    
                    // Render Mermaid diagrams if any were found
                    if (mermaidCount > 0 && typeof mermaid !== 'undefined') {
                        console.log('Rendering ' + mermaidCount + ' Mermaid diagrams...');
                        try {
                            // Use mermaid.run() to render all diagrams with class 'mermaid'
                            mermaid.run({
                                querySelector: '.mermaid'
                            });
                            console.log('Mermaid diagrams rendered successfully');
                        } catch (error) {
                            console.error('Error rendering Mermaid diagrams:', error);
                            // Fallback: try the older API
                            try {
                                mermaid.init(undefined, '.mermaid');
                                console.log('Mermaid diagrams rendered with fallback method');
                            } catch (fallbackError) {
                                console.error('Fallback rendering also failed:', fallbackError);
                            }
                        }
                    } else if (mermaidCount > 0) {
                        console.error('Mermaid library not available');
                    }
                }

                function applyMarkdownStyling(element) {
                    // Apply styling to all markdown elements
                    element.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
                        el.style.marginTop = '1em';
                        el.style.marginBottom = '0.5em';
                        el.style.color = 'var(--vscode-foreground)';
                    });
                    element.querySelectorAll('p').forEach(el => {
                        el.style.marginTop = '0.5em';
                        el.style.marginBottom = '0.5em';
                        el.style.color = 'var(--vscode-foreground)';
                    });
                    element.querySelectorAll('ul, ol').forEach(el => {
                        el.style.paddingLeft = '2em';
                        el.style.marginTop = '0.5em';
                        el.style.marginBottom = '0.5em';
                    });
                    element.querySelectorAll('li').forEach(el => {
                        el.style.marginTop = '0.25em';
                        el.style.marginBottom = '0.25em';
                    });
                    element.querySelectorAll('code').forEach(el => {
                        el.style.fontFamily = 'var(--vscode-editor-font-family)';
                        el.style.backgroundColor = 'var(--vscode-textBlockQuote-background)';
                        el.style.padding = '0.2em 0.4em';
                        el.style.borderRadius = '3px';
                        el.style.color = 'var(--vscode-foreground)';
                    });
                    element.querySelectorAll('pre').forEach(el => {
                        el.style.backgroundColor = 'var(--vscode-textBlockQuote-background)';
                        el.style.padding = '1em';
                        el.style.borderRadius = '5px';
                        el.style.overflowX = 'auto';
                        el.style.marginTop = '1em';
                        el.style.marginBottom = '1em';
                    });
                    element.querySelectorAll('blockquote').forEach(el => {
                        el.style.margin = '1em 0';
                        el.style.padding = '0.5em 1em';
                        el.style.borderLeft = '4px solid var(--vscode-button-background)';
                        el.style.backgroundColor = 'var(--vscode-textBlockQuote-background)';
                    });
                    element.querySelectorAll('table').forEach(el => {
                        el.style.borderCollapse = 'collapse';
                        el.style.width = '100%';
                        el.style.margin = '1em 0';
                    });
                    element.querySelectorAll('th, td').forEach(el => {
                        el.style.border = '1px solid var(--vscode-panel-border)';
                        el.style.padding = '0.5em';
                        el.style.textAlign = 'left';
                    });
                    element.querySelectorAll('th').forEach(el => {
                        el.style.backgroundColor = 'var(--vscode-tab-inactiveBackground)';
                        el.style.fontWeight = 'bold';
                    });
                    element.querySelectorAll('a').forEach(el => {
                        el.style.color = 'var(--vscode-textLink-foreground)';
                        el.style.textDecoration = 'none';
                    });
                    element.querySelectorAll('a:hover').forEach(el => {
                        el.style.textDecoration = 'underline';
                    });
                    element.querySelectorAll('hr').forEach(el => {
                        el.style.border = '0';
                        el.style.borderTop = '1px solid var(--vscode-panel-border)';
                        el.style.margin = '1em 0';
                    });
                }

        function showExplanationOptions() {
            document.getElementById('explanation-placeholder').style.display = 'block';
            document.getElementById('class-documentation-content').style.display = 'none';
        }

        function renderVisualization(data) {
            const visualizationContent = document.getElementById('overview-content');
            const statsPanel = document.getElementById('statsPanel');
            const statsGrid = document.getElementById('statsGrid');
            const placeholder = document.getElementById('overview-placeholder');
            
            placeholder.style.display = 'none';
            visualizationContent.style.display = 'flex';
            statsPanel.style.display = 'block';
        

        statsGrid.innerHTML = `
            <div class="stat-item">
                <div class="stat-number">\${data.stats.totalClasses}</div>
                <div class="stat-label">Classes</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.controllers}</div>
                <div class="stat-label">Controllers</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.services}</div>
                <div class="stat-label">Services</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.repositories}</div>
                <div class="stat-label">Repositories</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.entities}</div>
                <div class="stat-label">Entities</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.dependencies}</div>
                <div class="stat-label">Dependencies</div>
            </div>
        \`;
        
        visualizationContent.innerHTML = '<div class="architecture-layers-container"></div>';
        const layersContainer = visualizationContent.querySelector('.architecture-layers-container');
        
        // Controllers layer
        if (data.layers.controllers.length > 0) {
            const controllerLayer = document.createElement('div');
            controllerLayer.className = 'architecture-layer';
            controllerLayer.innerHTML = \`
                <div class="layer-header controller">
                    <span>Controller Layer (\${data.layers.controllers.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.controllers.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(controllerLayer);
        }
        
        // Services layer
        if (data.layers.services.length > 0) {
            const serviceLayer = document.createElement('div');
            serviceLayer.className = 'architecture-layer';
            serviceLayer.innerHTML = \`
                <div class="layer-header service">
                    <span>Service Layer (\${data.layers.services.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.services.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(serviceLayer);
        }
        
        // Repositories layer
        if (data.layers.repositories.length > 0) {
            const repositoryLayer = document.createElement('div');
            repositoryLayer.className = 'architecture-layer';
            repositoryLayer.innerHTML = \`
                <div class="layer-header repository">
                    <span>Repository Layer (\${data.layers.repositories.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.repositories.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(repositoryLayer);
        }
        
        // Entities layer
        if (data.layers.entities.length > 0) {
            const entityLayer = document.createElement('div');
            entityLayer.className = 'architecture-layer';
            entityLayer.innerHTML = \`
                <div class="layer-header entity">
                    <span>Entity Layer (\${data.layers.entities.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.entities.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(entityLayer);
        }
        
        // Others layer
        if (data.layers.others.length > 0) {
            const otherLayer = document.createElement('div');
            otherLayer.className = 'architecture-layer';
            otherLayer.innerHTML = \`
                <div class="layer-header">
                    <span>Other Components (\${data.layers.others.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.others.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(otherLayer);
        }
        
        // Add click handlers for class cards
        document.querySelectorAll('.class-card').forEach(card => {
            card.addEventListener('click', () => {
                const nodeId = card.getAttribute('data-id');
                vscode.postMessage({ type: 'selectNode', nodeId: nodeId });
            });
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        document.getElementById('tab-overview').addEventListener('click', () => {
            switchTab('overview');
            console.log('overview button is clicked');
        });
        document.getElementById('tab-chat').addEventListener('click', () => {
            switchTab('chat');
        });
        document.getElementById('tab-explanation').addEventListener('click', () => {
            switchTab('explanation');
        });
        document.getElementById('tab-visualization2').addEventListener('click', () => {
            switchTab('visualization2');
        });
        document.getElementById('visualize-btn-large').addEventListener('click', refreshVisualization);
        
        document.getElementById('generate-project-doc-btn').addEventListener('click', generateProjectDocumentation);
        document.getElementById('generate-class-doc-btn').addEventListener('click', generateClassDocumentation);
        document.getElementById('export-class-doc-btn').addEventListener('click', exportClassDocumentation);
        document.getElementById('back-to-explanation-btn').addEventListener('click', showExplanationOptions);

        switchTab('overview');
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'updateVisualization':
                renderVisualization(message.data);
                break;
            case 'showExplanation':
                showClassDocumentation(message.text);
                if (message.markdown) {
                    document.getElementById('class-documentation-content').dataset.markdown = message.markdown;
                }
                switchTab('explanation');
                break;
            case 'showProjectOverview':
                showProjectDocumentation(message.text);
                if (message.markdown) {
                    document.getElementById('class-documentation-content').dataset.markdown = message.markdown;
                }
                switchTab('explanation');
                break;
            case 'botResponse':
                showBotResponse(message.text);
                break;
            case 'refreshing':
                break;
        }
    });

    function showBotResponse(text) {
        const chatMessages = document.getElementById('chatMessages');
        const placeholder = chatMessages.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.innerHTML = text;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Clear input
        document.getElementById('chatInput').value = '';
    }

    // Add chat functionality
    document.addEventListener('DOMContentLoaded', () => {
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendButton');

        // Auto-resize textarea
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // Send message on button click
        sendButton.addEventListener('click', () => {
            const message = chatInput.value.trim();
            if (message) {
                // Add user message to chat
                const chatMessages = document.getElementById('chatMessages');
                const placeholder = chatMessages.querySelector('.placeholder');
                if (placeholder) {
                    placeholder.remove();
                }

                const userMessageDiv = document.createElement('div');
                userMessageDiv.className = 'message user-message';
                userMessageDiv.textContent = message;
                chatMessages.appendChild(userMessageDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;

                // Send to backend
                vscode.postMessage({ type: 'sendMessage', text: message });
            }
        });

        // Send message on Enter key (without Shift)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendButton.click();
            }
        });
    });
</script>

        </body>
        </html>`;
}