const service = require('../services/learningAnalysisService');
const { success } = require('../utils/response');
const mine = async (req,res,next)=>{try{res.json(success(await service.analyze(req.user.id)))}catch(e){next(e)}};
const overview = async (req,res,next)=>{try{res.json(success(await service.overview(req.user)))}catch(e){next(e)}};
const student = async (req,res,next)=>{try{res.json(success(await service.analyze(Number(req.params.userId), req.user)))}catch(e){next(e)}};
module.exports={mine,overview,student};
