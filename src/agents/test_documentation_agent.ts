import { DocumentationAgent } from './documentation_agent';
import { AgentContext } from './types';

async function testDocumentationAgent() {
    console.log('Testing Documentation Agent with Langchain...');
    
    // Initialize the agent with a test API key (this would normally come from config)
    const agent = new DocumentationAgent(process.env.OPENAI_API_KEY);
    
    // Test project overview generation
    const projectContext: AgentContext = {
        userQuery: 'Generate project overview documentation'
    };
    
    try {
        console.log('Generating project overview...');
        const projectResponse = await agent.execute(projectContext);
        console.log('Project Overview Response:');
        console.log(projectResponse.content.substring(0, 500) + '...'); // Truncate for brevity
        console.log('---');
        
        // Test class documentation generation
        const classContext: AgentContext = {
            selectedCode: `public class UserService {
    @Autowired
    private UserRepository userRepository;
    
    public User createUser(User user) {
        return userRepository.save(user);
    }
    
    public User getUserById(Long id) {
        return userRepository.findById(id).orElse(null);
    }
}`,
            filePath: 'UserService.java'
        };
        
        console.log('Generating class documentation...');
        const classResponse = await agent.execute(classContext);
        console.log('Class Documentation Response:');
        console.log(classResponse.content.substring(0, 500) + '...'); // Truncate for brevity
        console.log('---');
        
        console.log('Documentation Agent test completed successfully!');
    } catch (error) {
        console.error('Error testing Documentation Agent:', error);
    }
}

// Run the test
testDocumentationAgent();