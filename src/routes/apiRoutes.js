import { Router } from 'express';
import { asyncHandler } from '../core/asyncHandler.js';
import { getHealth } from '../controllers/systemController.js';
import { createAssistantReply } from '../controllers/assistantController.js';
import { detectVision } from '../controllers/visionController.js';
import {
  createMultimodalTask,
  getMultimodalTask,
  listMultimodalTask
} from '../controllers/multimodalController.js';
import { createTravelPlan } from '../controllers/travelController.js';
import {
  getAuthProviders,
  getCurrentSession,
  login,
  getLoginUrl,
  handleOAuthCallback,
  logout,
  register,
  redirectToProvider
} from '../controllers/authController.js';
import { getTravelHistory, toggleFavoriteHistory } from '../controllers/userController.js';
import {
  createKnowledge,
  createKnowledgeCategory,
  createCustomerReply,
  createSupportTicket,
  createTicketReply,
  deleteKnowledgeItem,
  fetchChannels,
  fetchConfig,
  fetchConversation,
  fetchConversationList,
  fetchDashboard,
  fetchFuncMenu,
  fetchKnowledgeCategoryList,
  fetchKnowledgeList,
  fetchLogs,
  fetchRobots,
  fetchRoles,
  fetchTickets,
  submitSatisfaction,
  updateKnowledgeItem,
  updateSupportTicketStatus
} from '../controllers/customerServiceController.js';

const router = Router();

router.get('/health', getHealth);
router.get('/auth/providers', getAuthProviders);
router.get('/auth/session', getCurrentSession);
router.post('/auth/register', asyncHandler(register));
router.post('/auth/login', asyncHandler(login));
router.get('/auth/login-url/:provider', getLoginUrl);
router.get('/auth/redirect/:provider', redirectToProvider);
router.get('/auth/callback/:provider', asyncHandler(handleOAuthCallback));
router.post('/auth/logout', logout);
router.get('/user/travel-history', asyncHandler(getTravelHistory));
router.post('/user/travel-history/:id/favorite', asyncHandler(toggleFavoriteHistory));
router.post('/', asyncHandler(createAssistantReply));
router.post('/vision/detect', asyncHandler(detectVision));
router.get('/multimodal/tasks', listMultimodalTask);
router.get('/multimodal/tasks/:id', getMultimodalTask);
router.post('/multimodal/tasks', asyncHandler(createMultimodalTask));
router.post('/travel', asyncHandler(createTravelPlan));

router.get('/funcMenu', fetchFuncMenu);
router.get('/knowledge', fetchKnowledgeList);
router.post('/knowledge', asyncHandler(createKnowledge));
router.put('/knowledge/:id', asyncHandler(updateKnowledgeItem));
router.delete('/knowledge/:id', deleteKnowledgeItem);
router.get('/knowledge-categories', fetchKnowledgeCategoryList);
router.post('/knowledge-categories', createKnowledgeCategory);
router.get('/robot', fetchRobots);
router.get('/channel', fetchChannels);
router.get('/ticket', fetchTickets);
router.post('/ticket', asyncHandler(createSupportTicket));
router.patch('/ticket/:id/status', asyncHandler(updateSupportTicketStatus));
router.post('/ticket/:id/replies', asyncHandler(createTicketReply));
router.post('/customer/reply', asyncHandler(createCustomerReply));
router.get('/customer/conversations', fetchConversationList);
router.get('/customer/conversations/:id', fetchConversation);
router.post('/customer/conversations/:id/satisfaction', submitSatisfaction);
router.get('/data', fetchDashboard);
router.get('/config', fetchConfig);
router.get('/role', fetchRoles);
router.get('/log', fetchLogs);

export default router;