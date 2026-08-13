const service = require('../services/adaptivePracticeService');
const { success } = require('../utils/response');

const inventory = async (req, res, next) => { try { res.json(success(await service.inventory(req.body))); } catch (error) { next(error); } };
const start = async (req, res, next) => { try { res.status(201).json(success(await service.start(req.user.id, req.body), '练习已开始')); } catch (error) { next(error); } };
const submit = async (req, res, next) => { try { res.json(success(await service.submit(req.user.id, req.params.id, req.body))); } catch (error) { next(error); } };
const getSession = async (req, res, next) => { try { res.json(success(await service.getSession(req.user.id, req.params.id))); } catch (error) { next(error); } };
const overview = async (req, res, next) => { try { res.json(success(await service.overview())); } catch (error) { next(error); } };
const progress = async (req, res, next) => { try { res.json(success(await service.progress(req.user.id))); } catch (error) { next(error); } };

module.exports = { inventory, start, submit, getSession, overview, progress };
